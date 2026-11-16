import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { captureConsola } from "~/tests/utils/capture-consola";

// `get-page-styles` creates its `consola.withTag("ChaiPageStyles")` logger at module scope, and
// consola copies the root reporter list into a tagged child when it is created. Start capturing
// before the module is first loaded so the child inherits the capture reporter.
const log = captureConsola();
const { fetchPageStylesUncached, getPageStyles } = await import("./get-page-styles");

// The global stylesheet page styles are deduplicated against: a real file, located via
// CHAI_GLOBAL_CSS_PATH. `.bg-red-500` is global; `.p-4` is page-only.
const BASE_CSS = ".bg-red-500 { background-color: red; }\n";

let tmpDir: string;
let basePath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chai-page-styles-"));
  basePath = path.join(tmpDir, "chaistyles.css");
  await fs.writeFile(basePath, BASE_CSS);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

let mtime = 1000;
beforeEach(async () => {
  // A fresh mtime per test invalidates the parsed-stylesheet cache left by the previous test.
  mtime += 1000;
  await fs.utimes(basePath, mtime, mtime);
  vi.stubEnv("CHAI_GLOBAL_CSS_PATH", basePath);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  log.records.length = 0;
});

const styledBox = (classes: string) =>
  ({ _id: "1", _type: "Box", _parent: null, styles: `#styles:,${classes}` }) as never;

describe("get-page-styles", () => {
  it("warns when uncached compile exceeds 30ms", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValue(1035);

    await fetchPageStylesUncached([styledBox("p-4")]);

    const warnings = log.messages("warn", "ChaiPageStyles");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Slow page styles compile");
    expect(warnings[0]).toContain("35ms");
    expect(warnings[0]).toContain("blocks: 1");
  });

  it("does not warn when uncached compile is under 30ms", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValue(1010);

    await fetchPageStylesUncached([styledBox("p-4")]);

    expect(log.messages("warn", "ChaiPageStyles")).toEqual([]);
  });

  it("minifies whitespace before filtering duplicates", async () => {
    const result = await fetchPageStylesUncached([styledBox("bg-red-500 p-4")]);

    // Compiled for real: the page-only utility survives, the global one is filtered out.
    expect(result).toContain(".p-4");
    expect(result).not.toContain(".bg-red-500");
    // Whitespace collapsed to single spaces before postcss re-serialised it.
    expect(result).not.toMatch(/\n|\s{2,}/);
    expect(result).toBe(result.trim());
  });

  it("renders without page styles when the compile throws, and recompiles on the next request", async () => {
    // Like Next's unstable_cache: a fulfilled result is persisted per key, a rejection is not.
    const stored = new Map<string, unknown>();
    installMemoryPersistentCache({
      persistentCache: ((fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
        async (...args: unknown[]) => {
          const key = keyParts.join("|");
          if (stored.has(key)) return stored.get(key);
          const value = await fn(...args);
          stored.set(key, value);
          return value;
        }) as never,
    });

    let failCompile = true;
    const flaky = {
      _id: "1",
      _type: "Box",
      _parent: null,
      get styles(): string {
        if (failCompile) throw new Error("compile boom");
        return "#styles:,p-4";
      },
    } as never;
    const render = () => withRequestContext(() => getPageStyles("page-1", [flaky]), { draft: false });

    await expect(render()).resolves.toBe("");
    const errors = log.messages("error", "ChaiPageStyles");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("page: page-1");

    // A fallback persisted inside the cache wrapper would be served here instead.
    failCompile = false;
    await expect(render()).resolves.toContain(".p-4");
    expect(stored.size).toBe(1);
  });

  it("keys the persisted cache by the merge version and global stylesheet fingerprint", async () => {
    const cache = installMemoryPersistentCache();
    const fingerprint = crypto.createHash("sha1").update(BASE_CSS).digest("hex").slice(0, 12);

    await withRequestContext(() => getPageStyles("page-1", []), { draft: false });

    expect(cache.wraps).toEqual([
      {
        keyParts: [`page-styles-${TEST_APP_ID}-page-1-c4-m3-g-${fingerprint}`],
        tags: ["page-styles", "page-page-1"],
      },
    ]);
  });
});
