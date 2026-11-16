// The package's public subpaths and the TypeScript source behind each one.
//
// package.json "exports" points every JS subpath at `./dist/<entry>.js`; tsup.config.ts maps
// `<entry>` to its source file. Joining the two gives `chaipro/nextjs/server` →
// `./src/nextjs/server.ts`. Used by host-paths.mjs (aliases for subtree hosts) and by the
// agent-skills checks. Edition-agnostic: the package name comes from package.json.
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * @returns {{ name: string, version: string, sources: Record<string, string>, nonSource: string[] }}
 *   `sources` maps export keys (`.`, `./registry`, `./ui/*`) to `./src/…` paths relative to `root`;
 *   `nonSource` lists export keys with no TypeScript source (CSS files).
 */
export function readPackageEntries(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const tsup = readFileSync(path.join(root, "tsup.config.ts"), "utf8");
  const block = /const entries = \{([\s\S]*?)\n\};/.exec(tsup);
  if (!block) throw new Error("could not find `const entries = { … }` in tsup.config.ts");
  const entries = {};
  for (const m of block[1].matchAll(/^\s*"?([\w\-/]+)"?\s*:\s*"(\.\/src\/[^"]+)"/gm)) entries[m[1]] = m[2];

  const sources = {};
  const nonSource = [];
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    const file = typeof target === "string" ? target : (target.import ?? target.default);
    const m = /^\.\/dist\/(.+)\.js$/.exec(file ?? "");
    if (!m) {
      nonSource.push(key);
      continue;
    }
    if (m[1].includes("*")) {
      // `./ui/*` → `./dist/components/ui/*.js`: derive the source pattern from any matching entry.
      const [head, tail] = m[1].split("*");
      const sample = Object.entries(entries).find(([e]) => e.startsWith(head) && e.endsWith(tail));
      if (sample) {
        const stem = sample[0].slice(head.length, sample[0].length - tail.length);
        const file = sample[1];
        const at = file.lastIndexOf(stem);
        sources[key] = `${file.slice(0, at)}*${file.slice(at + stem.length).replace(/\.tsx?$/, "")}`;
      } else nonSource.push(key);
      continue;
    }
    if (entries[m[1]]) sources[key] = entries[m[1]];
    else nonSource.push(key);
  }
  return { name: pkg.name, version: pkg.version, sources, nonSource };
}

/** `.` → `chaipro`, `./nextjs/server` → `chaipro/nextjs/server`. */
export const toSpecifier = (name, subpath) => (subpath === "." ? name : `${name}/${subpath.slice(2)}`);
