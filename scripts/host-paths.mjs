#!/usr/bin/env node
// tsconfig `paths` for a host app that vendors this repo as a git subtree instead of installing
// the npm package. With them, host code imports `chaipro/<subpath>` (or `chaicore/<subpath>`)
// exactly as an npm host does, so docs, examples and the agent skills apply unchanged.
//
//   node <prefix>/scripts/host-paths.mjs            # print the entries, run from the host root
//   node <prefix>/scripts/host-paths.mjs --write    # merge them into ./tsconfig.json
//   node <prefix>/scripts/host-paths.mjs --tsconfig apps/web/tsconfig.json
//
// Next.js honours tsconfig `paths` for webpack and Turbopack, so no bundler alias is needed.
// The SDK's own source imports `~/…`, so `~/*` → `<prefix>/src/*` is included too.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageEntries, toSpecifier } from "./package-entries.mjs";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const write = args.includes("--write");
const tsconfigPath = path.resolve(flag("--tsconfig") ?? "tsconfig.json");

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { name, sources, nonSource } = readPackageEntries(sdkRoot);

// tsconfig `paths` resolve against the directory of the tsconfig that declares them (no baseUrl).
let prefix = path.relative(path.dirname(tsconfigPath), sdkRoot).split(path.sep).join("/");
if (!prefix.startsWith(".")) prefix = `./${prefix}`;
const at = (src) => `${prefix}/${src.replace(/^\.\//, "")}`;

const paths = { [`~/*`]: [at("src/*")] };
for (const [subpath, src] of Object.entries(sources)) paths[toSpecifier(name, subpath)] = [at(src)];

if (!write) {
  console.log(JSON.stringify(paths, null, 2));
  console.error(
    `\nAdd these to compilerOptions.paths in ${path.relative(process.cwd(), tsconfigPath) || "tsconfig.json"}` +
      ` (or rerun with --write). ${nonSource.length} CSS export(s) have no source alias: ${nonSource.join(", ")}.`,
  );
  process.exit(0);
}

if (!existsSync(tsconfigPath)) {
  console.error(`✖ ${tsconfigPath} not found; pass --tsconfig <path>`);
  process.exit(1);
}
let tsconfig;
try {
  tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
} catch {
  console.error(`✖ ${tsconfigPath} is not plain JSON (comments?). Run without --write and paste the entries.`);
  process.exit(1);
}
tsconfig.compilerOptions ??= {};
const existing = tsconfig.compilerOptions.paths ?? {};
if (existing["~/*"] && JSON.stringify(existing["~/*"]) !== JSON.stringify(paths["~/*"])) {
  console.error(
    `✖ "~/*" already maps to ${JSON.stringify(existing["~/*"])}; the SDK needs ${JSON.stringify(paths["~/*"])}.`,
  );
  process.exit(1);
}
tsconfig.compilerOptions.paths = { ...existing, ...paths };
writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
console.log(`✓ ${Object.keys(paths).length} ${name} path aliases written to ${tsconfigPath}`);
