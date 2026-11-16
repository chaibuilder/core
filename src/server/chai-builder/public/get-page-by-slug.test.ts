import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { fake } from "~/tests/setup/fakers";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import type { PageRoutingMetadata } from "./page-routing-cache";
import { resolvePageBySlug, resolvePageBySlugQuery } from "./get-page-by-slug";

// resolvePageBySlugQuery returns the resolved page, or the competing candidates
// when several dynamic templates match. Every case here resolves to exactly one
// page, so narrow to it (and fail loudly if the shape is unexpectedly a list).
const single = (resolved: PageRoutingMetadata | PageRoutingMetadata[]): PageRoutingMetadata => {
  if (Array.isArray(resolved)) throw new Error(`expected a single resolved page, got ${resolved.length} candidates`);
  return resolved;
};

describe("resolvePageBySlugQuery - Integration", () => {
  it("resolves a static page by its slug", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/about", pageType: "page" }));

      const resolved = await resolvePageBySlugQuery(TEST_APP_ID, true, "/about");
      expect(single(resolved).id).toBe(page.id);
    });
  });

  it("prefers a real page over a partial that shares the same slug", async () => {
    await withTestDB(async ({ seed }) => {
      // A `global` partial mis-saved with a routable slug (normally partials have
      // an empty slug) collides with the real page at the same URL. Seed the
      // partial first so an unbiased match order would surface it, then assert
      // the routable page still wins — otherwise the URL renders a content-less
      // partial (the Subaru `/en` home regression: HTTP 200 with an empty page,
      // not a 404).
      await seed("appPagesOnline", fake.appPagesOnline({ slug: "/en", pageType: "global" }));
      const page = await seed("appPagesOnline", fake.appPagesOnline({ slug: "/en", pageType: "page" }));

      const resolved = await resolvePageBySlugQuery(TEST_APP_ID, false, "/en");
      expect(single(resolved).id).toBe(page.id);
      expect(single(resolved).pageType).toBe("page");
    });
  });

  it("does not resolve a folder's own slug (direct visit is a 404)", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));

      await expect(resolvePageBySlugQuery(TEST_APP_ID, true, "/company")).rejects.toThrow("PAGE_NOT_FOUND");
    });
  });

  it("resolves a child page under a folder", async () => {
    await withTestDB(async ({ seed }) => {
      const folder = await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));
      const child = await seed(
        "appPages",
        fake.appPages({ slug: "/company/about", pageType: "page", parent: folder.id }),
      );

      const resolved = await resolvePageBySlugQuery(TEST_APP_ID, true, "/company/about");
      expect(single(resolved).id).toBe(child.id);
    });
  });

  it("does not resolve a folder from the online table either", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPagesOnline", fake.appPagesOnline({ slug: "/company", pageType: "_folder" }));

      await expect(resolvePageBySlugQuery(TEST_APP_ID, false, "/company")).rejects.toThrow("PAGE_NOT_FOUND");
    });
  });

  // The static-lookup exclusion alone is not the guarantee: a folder carrying
  // `dynamic` skips that path entirely and is picked up by the dynamic-candidate
  // query instead, rendering at the URL it is supposed to 404 on.
  it("does not resolve a dynamic folder through the dynamic-candidate path", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder", dynamic: true }));

      await expect(resolvePageBySlugQuery(TEST_APP_ID, true, "/company")).rejects.toThrow("PAGE_NOT_FOUND");
    });
  });

  it("does not resolve a dynamic folder from the online table either", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPagesOnline", fake.appPagesOnline({ slug: "/company", pageType: "_folder", dynamic: true }));

      await expect(resolvePageBySlugQuery(TEST_APP_ID, false, "/company")).rejects.toThrow("PAGE_NOT_FOUND");
    });
  });
});

// A failed lookup must never read as "no page at this slug": PAGE_NOT_FOUND becomes a
// 404 the public route caches, and the routing entry itself has no expiry.
describe("resolvePageBySlug - query failure", () => {
  it("throws the query error with its cause instead of PAGE_NOT_FOUND", async () => {
    await withTableUnavailable(schema.appPagesOnline, async () => {
      const error = await resolvePageBySlugQuery(TEST_APP_ID, false, "/about").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("FAILED_TO_RESOLVE_PAGE");
      expect((error as Error).cause).toBeInstanceOf(Error);
    });
  });

  it("does not persist the failure: the slug resolves once the table is back", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPagesOnline", fake.appPagesOnline({ slug: "/about", pageType: "page" }));
      installMemoryPersistentCache();
      const resolve = () => withRequestContext(() => resolvePageBySlug("/about"), { draft: false });

      await withTableUnavailable(schema.appPagesOnline, async () => {
        await expect(resolve()).rejects.toThrow("FAILED_TO_RESOLVE_PAGE");
      });

      await expect(resolve()).resolves.toMatchObject({ id: page.id });
    });
  });
});
