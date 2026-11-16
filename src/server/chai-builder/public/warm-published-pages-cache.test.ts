import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { getFrameworkAdapter, setFrameworkAdapter } from "~/server/framework-adapter";
import { mswServer } from "~/tests/builder/msw";
import { installMemoryPersistentCache, type MemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { extractPageIdsFromTags, warmPublishedPagesCache } from "./warm-published-pages-cache";

const box = { _id: "1", _type: "Box", _parent: null };

/** Public site requests that reached the network, with the headers they were sent with. */
let siteRequests: { url: string; userAgent: string | null }[];

beforeEach(() => {
  siteRequests = [];
  mswServer.use(
    http.get("https://example.com/*", ({ request }) => {
      siteRequests.push({ url: request.url, userAgent: request.headers.get("User-Agent") });
      return new HttpResponse("<html></html>", { status: 200 });
    }),
  );
});

/** Page ids whose styles were computed through the persistent cache (one wrap per getPageStyles call). */
const pageStyleWarmups = (cache: MemoryPersistentCache) =>
  cache.wraps.filter((wrap) => wrap.keyParts[0]?.startsWith("page-styles-")).flatMap((wrap) => wrap.tags.slice(1));

describe("warm-published-pages-cache", () => {
  describe("extractPageIdsFromTags", () => {
    it("extracts unique page ids and ignores non-page tags", () => {
      const tags = [
        "page-abc123",
        "page-abc123",
        "page-def456",
        "page-styles",
        "page-slugs",
        "breadcrumb-abc123",
        "slug-cGFnZQ",
        "website-settings-app-1",
      ];

      expect(extractPageIdsFromTags(tags)).toEqual(["abc123", "def456"]);
    });

    it("does not treat page slug tags as page ids", () => {
      expect(extractPageIdsFromTags(["page-slug:abc123", "page-abc123"])).toEqual(["abc123"]);
    });
  });

  describe("warmPublishedPagesCache", () => {
    it("prefetches static routes and skips style warmup for those page ids", async () => {
      await withTestDB(async ({ seed }) => {
        await seed("appPagesOnline", { id: "static-page", slug: "/about", dynamic: false, blocks: [box] });
      });
      const cache = installMemoryPersistentCache();

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: "https://example.com",
        tags: ["page-static-page"],
        paths: ["/about"],
      });

      expect(siteRequests).toEqual([{ url: "https://example.com/about", userAgent: "ChaiBuilder-Publish-Warmup" }]);
      expect(pageStyleWarmups(cache)).toEqual([]);
      expect(result.routesWarmed).toBe(1);
      expect(result.stylesWarmed).toBe(0);
      expect(result.stylesSkipped).toBe(1);
    });

    it("warms styles for dynamic pages and skips route prefetch", async () => {
      await withTestDB(async ({ seed }) => {
        await seed("appPagesOnline", { id: "dynamic-page", slug: "/blog", dynamic: true, blocks: [box] });
      });
      const cache = installMemoryPersistentCache();

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: "https://example.com",
        tags: ["page-dynamic-page"],
        paths: ["/blog"],
      });

      expect(siteRequests).toEqual([]);
      expect(pageStyleWarmups(cache)).toEqual(["page-dynamic-page"]);
      expect(result.routesSkipped).toBe(1);
      expect(result.stylesWarmed).toBe(1);
    });

    it("warms styles for slug pages and skips partial pages without slug", async () => {
      await withTestDB(async ({ seedMany }) => {
        await seedMany("appPagesOnline", [
          { id: "slug-page", slug: "/about", dynamic: true, blocks: [box] },
          { id: "partial-block", slug: "", dynamic: false, pageType: "global", blocks: [] },
        ]);
      });
      const cache = installMemoryPersistentCache();

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: null,
        tags: ["page-slug-page", "page-partial-block"],
        paths: [],
      });

      expect(result.stylesWarmed).toBe(1);
      expect(result.stylesSkipped).toBe(1);
      expect(pageStyleWarmups(cache)).toEqual(["page-slug-page"]);
    });

    it("falls back to style warmup for static pages when siteUrl is missing", async () => {
      await withTestDB(async ({ seed }) => {
        await seed("appPagesOnline", { id: "static-page", slug: "/about", dynamic: false, blocks: [box] });
      });
      const cache = installMemoryPersistentCache();

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: null,
        tags: ["page-static-page"],
        paths: ["/about"],
      });

      expect(siteRequests).toEqual([]);
      expect(pageStyleWarmups(cache)).toEqual(["page-static-page"]);
      expect(result.routesSkipped).toBe(1);
      expect(result.stylesWarmed).toBe(1);
    });

    it("counts a page-styles compile failure as failed, not warmed", async () => {
      await withTestDB(async ({ seed }) => {
        await seed("appPagesOnline", { id: "dynamic-page", slug: "/blog", dynamic: true, blocks: [box] });
      });
      installMemoryPersistentCache();
      // The page loads through the memory cache; only the page-styles compile fails.
      const { persistentCache } = getFrameworkAdapter();
      setFrameworkAdapter({
        persistentCache: ((fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], opts?: unknown) =>
          keyParts[0]?.startsWith("page-styles-")
            ? async () => {
                throw new Error("compile boom");
              }
            : persistentCache(fn as never, keyParts, opts as never)) as never,
      });

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: null,
        tags: ["page-dynamic-page"],
        paths: [],
      });

      expect(result.stylesWarmed).toBe(0);
      expect(result.stylesFailed).toBe(1);
    });

    it("returns zero counts when there is nothing to warm", async () => {
      const cache = installMemoryPersistentCache();

      const result = await warmPublishedPagesCache({
        appId: TEST_APP_ID,
        siteUrl: "https://example.com",
        tags: ["website-settings-app-1"],
        paths: [],
      });

      expect(result).toEqual({
        routesWarmed: 0,
        routesSkipped: 0,
        routesFailed: 0,
        stylesWarmed: 0,
        stylesSkipped: 0,
        stylesFailed: 0,
        totalMs: expect.any(Number),
      });
      expect(siteRequests).toEqual([]);
      // No page was loaded: nothing went through the published cache at all.
      expect(cache.wraps).toEqual([]);
    });
  });
});
