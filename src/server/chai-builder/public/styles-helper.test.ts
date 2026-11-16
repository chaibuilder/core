import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_CSS = `
@layer properties;
@layer theme, base, components, utilities;
@layer theme {
  :root, :host { --color-red-500: oklch(63.7% 0.237 25.331); --spacing: 0.25rem; }
}
@layer utilities {
  .bg-red-500 { background: red; }
  .text-lg { font-size: 1.125rem; }
}
@media (min-width: 768px) { .md-only { display: flex; } }
@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
`;

// The global stylesheet is a real file in a temp dir; `CHAI_GLOBAL_CSS_PATH` points the helper at it.
let tmpDir: string;
let cssPath: string;

/** Writes the global stylesheet with an explicit mtime (seconds), the cache's change signal. */
const writeBaseCss = async (css: string = BASE_CSS, mtimeSec = 1000) => {
  await fs.writeFile(cssPath, css, "utf-8");
  await fs.utimes(cssPath, mtimeSec, mtimeSec);
};

/** Same byte length, same mtime: invisible to the stat-based cache check, so only a re-read would see it. */
const rewriteKeepingStat = async (css: string, mtimeSec = 1000) => {
  expect(Buffer.byteLength(css)).toBe(Buffer.byteLength(BASE_CSS));
  await writeBaseCss(css, mtimeSec);
};
const BASE_CSS_WITHOUT_BG_RED = BASE_CSS.replace(".bg-red-500", ".bg-red-600");

// The parsed-stylesheet cache is module state; each test gets a fresh module instance.
const importHelper = async () => import("./styles-helper");

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chai-styles-helper-"));
  cssPath = path.join(tmpDir, "chaistyles.css");
  vi.stubEnv("CHAI_GLOBAL_CSS_PATH", cssPath);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("filterDuplicateStyles", () => {
  it("removes top-level rules whose selectors exist in the base stylesheet", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const result = await filterDuplicateStyles(".bg-red-500 { background: red; } .p-4 { padding: 1rem; }");

    expect(result).not.toContain(".bg-red-500");
    expect(result).toContain(".p-4");
  });

  it("keeps duplicate selectors that live inside a media query", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const result = await filterDuplicateStyles(
      "@media (min-width: 768px) { .bg-red-500 { background: red; } } .bg-red-500 { background: red; }",
    );

    expect(result).toContain("@media (min-width: 768px)");
    expect(result).toMatch(/@media[^}]*\.bg-red-500/);
    expect(result.match(/\.bg-red-500/g)).toHaveLength(1);
  });

  it("removes :root custom properties already declared in the base stylesheet, keeps the rest", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const result = await filterDuplicateStyles(
      ":root, :host { --color-red-500: oklch(63.7% 0.237 25.331); --color-amber-500: oklch(76.9% 0.188 70.08); } .p-4 { padding: 1rem; }",
    );

    expect(result).not.toContain("--color-red-500");
    expect(result).toContain("--color-amber-500");
    expect(result).toContain(".p-4");
  });

  it("removes the :root rule entirely when all of its custom properties are duplicates", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const result = await filterDuplicateStyles(":root, :host { --color-red-500: red; --spacing: 0.25rem; }");

    expect(result.trim()).toBe("");
  });

  it("removes @property registrations already made in the base stylesheet", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const result = await filterDuplicateStyles(
      '@property --tw-shadow { syntax: "*"; inherits: false; } @property --tw-blur { syntax: "*"; inherits: false; }',
    );

    expect(result).not.toContain("--tw-shadow");
    expect(result).toContain("@property --tw-blur");
  });

  it("keeps duplicate selectors nested inside @supports and @layer blocks", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const input =
      "@layer properties { @supports (color: red) { .bg-red-500 { background: red; } } } .bg-red-500 { background: red; }";
    const result = await filterDuplicateStyles(input);

    expect(result).toContain("@layer properties");
    expect(result.match(/\.bg-red-500/g)).toHaveLength(1);
  });

  it("keeps rules whose selectors are not in the base stylesheet", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    const input = ".not-in-base { color: blue; }";
    expect(await filterDuplicateStyles(input)).toBe(input);
  });

  it("returns the input unchanged when the base stylesheet cannot be read", async () => {
    // No file written: the configured path does not exist.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { filterDuplicateStyles } = await importHelper();

    const input = ".bg-red-500 { background: red; }";
    expect(await filterDuplicateStyles(input)).toBe(input);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns the input unchanged when the input css is unparsable", async () => {
    await writeBaseCss();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { filterDuplicateStyles } = await importHelper();

    const input = ".broken { color: red;";
    expect(await filterDuplicateStyles(input)).toBe(input);
  });

  it("parses the base stylesheet once across calls when the file is unchanged", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles } = await importHelper();

    expect(await filterDuplicateStyles(".bg-red-500 { background: red; }")).not.toContain(".bg-red-500");

    // Content changes but size and mtime do not: a cached index still treats .bg-red-500 as global.
    await rewriteKeepingStat(BASE_CSS_WITHOUT_BG_RED);
    expect(await filterDuplicateStyles(".bg-red-500 { background: red; }")).not.toContain(".bg-red-500");
    expect(await filterDuplicateStyles(".text-lg { font-size: 1.125rem; }")).not.toContain(".text-lg");
    expect(await filterDuplicateStyles(".p-4 { padding: 1rem; }")).toContain(".p-4");
  });

  it("re-parses the base stylesheet when the file changes on disk", async () => {
    await writeBaseCss(BASE_CSS, 1000);
    const { filterDuplicateStyles } = await importHelper();

    const first = await filterDuplicateStyles(".bg-red-500 { background: red; }");
    expect(first).not.toContain(".bg-red-500");

    // Base stylesheet no longer contains .bg-red-500, so the rule must survive.
    await writeBaseCss(".other { color: green; }", 2000);
    const second = await filterDuplicateStyles(".bg-red-500 { background: red; }");
    expect(second).toContain(".bg-red-500");
    expect(await filterDuplicateStyles(".other { color: green; }")).not.toContain(".other");
  });

  it("still filters correctly after a failed read once the file becomes readable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { filterDuplicateStyles } = await importHelper();

    expect(await filterDuplicateStyles(".bg-red-500 { background: red; }")).toContain(".bg-red-500");

    await writeBaseCss();
    expect(await filterDuplicateStyles(".bg-red-500 { background: red; }")).not.toContain(".bg-red-500");
  });
});

describe("getGlobalStylesFingerprint", () => {
  it("returns a stable content hash for the same file", async () => {
    await writeBaseCss();
    const { getGlobalStylesFingerprint } = await importHelper();

    const first = await getGlobalStylesFingerprint();
    const second = await getGlobalStylesFingerprint();

    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(second).toBe(first);
  });

  it("changes when the global stylesheet changes", async () => {
    await writeBaseCss(BASE_CSS, 1000);
    const { getGlobalStylesFingerprint } = await importHelper();
    const first = await getGlobalStylesFingerprint();

    await writeBaseCss(".other { color: green; }", 2000);
    const second = await getGlobalStylesFingerprint();

    expect(second).not.toBe(first);
  });

  it('returns "none" when the global stylesheet is missing', async () => {
    const { getGlobalStylesFingerprint } = await importHelper();

    expect(await getGlobalStylesFingerprint()).toBe("none");
  });
});

describe("preloadBaseStyleSelectors", () => {
  it("warms the selector cache so the next filter call skips the file read", async () => {
    await writeBaseCss();
    const { filterDuplicateStyles, preloadBaseStyleSelectors } = await importHelper();

    preloadBaseStyleSelectors();
    // Let the background parse finish, then change the content without touching size/mtime.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rewriteKeepingStat(BASE_CSS_WITHOUT_BG_RED);

    // Filtering still sees .bg-red-500 as global: the index came from the preload, not a new read.
    const result = await filterDuplicateStyles(".bg-red-500 { background: red; }");
    expect(result).not.toContain(".bg-red-500");
  });

  it("swallows errors instead of rejecting", async () => {
    const { preloadBaseStyleSelectors } = await importHelper();

    expect(() => preloadBaseStyleSelectors()).not.toThrow();
    // Give the swallowed rejection a tick to surface if it were unhandled.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
