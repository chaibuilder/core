// Shared helpers for scripts/sync-src.mjs, scripts/sync-check.mjs and scripts/sync-log.mjs.
//
// chaibuilder/core and chaibuilder/pro keep `src/` byte-identical except for the paths listed
// in `src-sync.exclude` (pro-only plugins, the Payload integration, and `src/edition/`, which
// each repo owns). These helpers implement that contract in plain Node so the sync works the
// same on every machine and in CI — no rsync required. See SYNC.md.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MANIFEST_FILE = "src-sync.exclude";

/** Root files that must also stay identical between the two repos (they shape `src/`). */
export const ALSO_IDENTICAL = [
  MANIFEST_FILE,
  ".prettierrc",
  ".prettierignore",
  "declaration.d.ts",
  "eslint.config.mjs",
  "drizzle.config.test.ts",
  "vitest-setup.ts",
  "postcss.config.mjs",
  "scripts/sync-lib.mjs",
  "scripts/sync-src.mjs",
  "scripts/sync-check.mjs",
  "scripts/sync-log.mjs",
];

const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    if (!raw.startsWith("--")) {
      args._.push(raw);
      continue;
    }
    const eq = raw.indexOf("=");
    if (eq === -1) args[raw.slice(2)] = true;
    else args[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return args;
}

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function git(cwd, ...args) {
  // History reads (the commit list since the last sync) outgrow the 1 MB default after a long gap.
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

export function tryGit(cwd, ...args) {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
}

/** Repo root of `dir` (must be inside a git work tree). */
export function repoRoot(dir) {
  const root = tryGit(dir, "rev-parse", "--show-toplevel");
  if (!root) fail(`${dir} is not inside a git repository`);
  return root;
}

/** `owner/name` from the origin remote, or the directory name as a fallback. */
export function repoSlug(root) {
  const url = tryGit(root, "remote", "get-url", "origin") ?? "";
  const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : path.basename(root);
}

/** Short edition name used in commit subjects: `chaibuilder/pro` → `pro`. */
export function repoShortName(slug) {
  return slug.split("/").pop();
}

export function readManifest(root) {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) fail(`${file} is missing`);
  const dirs = [];
  const files = [];
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const entry = line.replace(/^\/+/, "");
    if (entry.endsWith("/")) dirs.push(entry.slice(0, -1));
    else files.push(entry);
  }
  return { dirs, files, text: fs.readFileSync(file) };
}

export function isExcluded(manifest, relPath) {
  for (const dir of manifest.dirs) {
    if (relPath === dir || relPath.startsWith(`${dir}/`)) return true;
  }
  return manifest.files.includes(relPath);
}

/**
 * Every non-excluded file under `<root>/src`, keyed by its src-relative POSIX path.
 *
 * Listed through git so gitignored artifacts (generated migrations, build output, local
 * scratch files) never count as part of the tree: tracked files plus untracked files that
 * are not ignored, minus anything deleted from the working tree.
 */
export function listSharedFiles(root, manifest) {
  const srcDir = path.join(root, "src");
  if (!fs.existsSync(srcDir)) fail(`${srcDir} does not exist`);
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "src"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = new Map();
  for (const file of listed.split("\0")) {
    if (!file) continue;
    const rel = file.slice("src/".length);
    if (rel.split("/").some((part) => JUNK.has(part))) continue;
    if (isExcluded(manifest, rel)) continue;
    const abs = path.join(root, file);
    // lstat, not stat: a symlink under src/ is not shared content and must never be followed.
    if (!fs.existsSync(abs) || !fs.lstatSync(abs).isFile()) continue;
    out.set(rel, abs);
  }
  return out;
}

export function sameBytes(a, b) {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Diff the shared tree of `sourceRoot` against `targetRoot`.
 * Returns src-relative paths: `add` (only in source), `update` (both, bytes differ),
 * `delete` (only in target), plus the count of identical files.
 */
export function diffSharedTrees(sourceRoot, targetRoot, manifest) {
  const source = listSharedFiles(sourceRoot, manifest);
  const target = listSharedFiles(targetRoot, manifest);
  const add = [];
  const update = [];
  const del = [];
  let identical = 0;
  for (const [rel, abs] of source) {
    const other = target.get(rel);
    if (!other) add.push(rel);
    else if (sameBytes(abs, other)) identical += 1;
    else update.push(rel);
  }
  for (const rel of target.keys()) {
    if (!source.has(rel)) del.push(rel);
  }
  add.sort();
  update.sort();
  del.sort();
  return { add, update, delete: del, identical, source, target };
}

/**
 * What a sync must copy outside `src/`: the ALSO_IDENTICAL root files whose bytes differ from
 * the source (or are missing here). `src-sync.exclude` is never copied — the two repos must
 * already agree on it before a sync runs (`assertSameManifest`), so it cannot be a sync's job.
 * `sourceMissing` names files this repo has and the source does not; those are left alone.
 */
export function diffRootFiles(sourceRoot, targetRoot) {
  const copy = [];
  const sourceMissing = [];
  for (const rel of ALSO_IDENTICAL) {
    if (rel === MANIFEST_FILE) continue;
    const source = path.join(sourceRoot, rel);
    const target = path.join(targetRoot, rel);
    if (!fs.existsSync(source)) {
      if (fs.existsSync(target)) sourceMissing.push(rel);
      continue;
    }
    if (!fs.existsSync(target) || !sameBytes(source, target)) copy.push(rel);
  }
  return { copy, sourceMissing };
}

/** Root files from ALSO_IDENTICAL whose bytes differ (or exist in only one repo). */
export function diffAlsoIdentical(rootA, rootB) {
  const drift = [];
  for (const rel of ALSO_IDENTICAL) {
    const a = path.join(rootA, rel);
    const b = path.join(rootB, rel);
    const ea = fs.existsSync(a);
    const eb = fs.existsSync(b);
    if (ea !== eb) drift.push({ rel, reason: ea ? "missing in sibling" : "missing here" });
    else if (ea && !sameBytes(a, b)) drift.push({ rel, reason: "differs" });
  }
  return drift;
}

export function manifestHash(manifest) {
  return `sha256:${createHash("sha256").update(manifest.text).digest("hex")}`;
}

export function assertSameManifest(rootA, rootB) {
  const a = readManifest(rootA);
  const b = readManifest(rootB);
  if (!a.text.equals(b.text)) {
    fail(
      `${MANIFEST_FILE} differs between ${rootA} and ${rootB}. ` +
        "Make it identical in both repos (same change) before syncing.",
    );
  }
  return a;
}

/** Wrap a line at `width` columns (commitlint caps body/footer lines at 100). */
export function wrap(text, width = 96) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
