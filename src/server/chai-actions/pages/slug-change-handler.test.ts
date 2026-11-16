import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { SlugChangeHandler } from "./slug-change-handler";

describe("SlugChangeHandler - Integration", () => {
  // ─── isSlugChanged ───────────────────────────────────────────────────

  it("should detect when slug has changed", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/test-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isSlugChanged(page.id, "/new-slug");
      expect(changed).toBe(true);
    });
  });

  it("should detect when slug has not changed", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/test-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isSlugChanged(page.id, "/test-page");
      expect(changed).toBe(false);
    });
  });

  it("should return false when newSlug is undefined", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/test-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isSlugChanged(page.id, undefined);
      expect(changed).toBe(false);
    });
  });

  it("should return false for non-existent page ID", async () => {
    const handler = new SlugChangeHandler(TEST_APP_ID);
    const changed = await handler.isSlugChanged(randomUUID(), "/some-slug");
    expect(changed).toBe(false);
  });

  // ─── isParentChanged ────────────────────────────────────────────────

  it("should detect when parent has changed", async () => {
    await withTestDB(async ({ seed }) => {
      const parentPage = await seed("appPages", fake.appPages({ slug: "/parent" }));

      const childPage = await seed("appPages", fake.appPages({ slug: "/parent/child", parent: parentPage.id }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isParentChanged(childPage.id, null);
      expect(changed).toBe(true);
    });
  });

  it("should detect when parent has not changed", async () => {
    await withTestDB(async ({ seed }) => {
      const parentPage = await seed("appPages", fake.appPages({ slug: "/parent" }));

      const childPage = await seed("appPages", fake.appPages({ slug: "/parent/child", parent: parentPage.id }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isParentChanged(childPage.id, parentPage.id);
      expect(changed).toBe(false);
    });
  });

  it("should return false when newParent is undefined", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/test-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isParentChanged(page.id, undefined);
      expect(changed).toBe(false);
    });
  });

  // ─── handleSlugChangeWithTree ───────────────────────────────────────

  it("should handle slug change for a root page", async () => {
    await withTestDB(async ({ seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/old-slug" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleSlugChangeWithTree(page.id, { slug: "/new-slug" });

      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe(page.id);
      expect(updates[0].newSlug).toBe("/new-slug");
    });
  });

  it("should cascade slug change to child pages", async () => {
    await withTestDB(async ({ seed }) => {
      const parentPage = await seed("appPages", fake.appPages({ slug: "/parent" }));

      const childPage = await seed("appPages", fake.appPages({ slug: "/parent/child", parent: parentPage.id }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleSlugChangeWithTree(parentPage.id, { slug: "/renamed" });

      expect(updates).toHaveLength(2);

      const parentUpdate = updates.find((u) => u.id === parentPage.id);
      const childUpdate = updates.find((u) => u.id === childPage.id);

      expect(parentUpdate?.newSlug).toBe("/renamed");
      expect(childUpdate?.newSlug).toBe("/renamed/child");
    });
  });

  it("should cascade slug change to deeply nested children", async () => {
    await withTestDB(async ({ seed }) => {
      const rootPage = await seed("appPages", fake.appPages({ slug: "/root" }));

      const childPage = await seed("appPages", fake.appPages({ slug: "/root/child", parent: rootPage.id }));

      const grandchildPage = await seed(
        "appPages",
        fake.appPages({ slug: "/root/child/grandchild", parent: childPage.id }),
      );

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleSlugChangeWithTree(rootPage.id, { slug: "/new-root" });

      expect(updates).toHaveLength(3);

      const rootUpdate = updates.find((u) => u.id === rootPage.id);
      const childUpdate = updates.find((u) => u.id === childPage.id);
      const grandchildUpdate = updates.find((u) => u.id === grandchildPage.id);

      expect(rootUpdate?.newSlug).toBe("/new-root");
      expect(childUpdate?.newSlug).toBe("/new-root/child");
      expect(grandchildUpdate?.newSlug).toBe("/new-root/child/grandchild");
    });
  });

  it("should throw error for duplicate slug", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPages", fake.appPages({ slug: "/existing-slug" }));

      const page = await seed("appPages", fake.appPages({ slug: "/old-slug" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);

      await expect(handler.handleSlugChangeWithTree(page.id, { slug: "/existing-slug" })).rejects.toMatchObject({
        code: "SLUG_ALREADY_EXISTS",
      });
    });
  });

  it("should NOT treat a soft-deleted page's slug as taken", async () => {
    await withTestDB(async ({ seed }) => {
      // A tombstone (deletedAt set) must not block reusing its slug — otherwise
      // deleting a page then recreating/moving another onto the same slug fails.
      await seed("appPages", fake.appPages({ slug: "/existing-slug", deletedAt: new Date().toISOString() }));

      const page = await seed("appPages", fake.appPages({ slug: "/old-slug" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);

      const updates = await handler.handleSlugChangeWithTree(page.id, { slug: "/existing-slug" });
      expect(updates).toEqual([{ id: page.id, oldSlug: "/old-slug", newSlug: "/existing-slug" }]);
    });
  });

  it("should handle slug change for a language page", async () => {
    await withTestDB(async ({ seed }) => {
      const primaryPage = await seed("appPages", fake.appPages({ slug: "/about" }));

      const langPage = await seed(
        "appPages",
        fake.appPages({ slug: "/about", lang: "fr", primaryPage: primaryPage.id }),
      );

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleSlugChangeWithTree(langPage.id, { slug: "/a-propos" });

      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe(langPage.id);
      expect(updates[0].newSlug).toBe("/a-propos");
    });
  });

  it("should throw error when language page slug conflicts with primary page", async () => {
    await withTestDB(async ({ seed }) => {
      const primaryPage = await seed("appPages", fake.appPages({ slug: "/about" }));
      await seed("appPages", fake.appPages({ slug: "/contact" }));

      const langPage = await seed(
        "appPages",
        fake.appPages({ slug: "/about", lang: "fr", primaryPage: primaryPage.id }),
      );

      const handler = new SlugChangeHandler(TEST_APP_ID);

      // Trying to set language page slug to an existing primary page slug
      await expect(handler.handleSlugChangeWithTree(langPage.id, { slug: "/contact" })).rejects.toMatchObject({
        code: "SLUG_ALREADY_EXISTS",
      });
    });
  });

  it("should throw error when page not found in tree", async () => {
    await withTestDB(async () => {
      const handler = new SlugChangeHandler(TEST_APP_ID);

      await expect(handler.handleSlugChangeWithTree(randomUUID(), { slug: "/new-slug" })).rejects.toThrow(
        "Page not found in tree",
      );
    });
  });

  // ─── handleParentChangeWithTree ─────────────────────────────────────

  it("should handle parent change and recalculate slug", async () => {
    await withTestDB(async ({ seed }) => {
      const newParent = await seed("appPages", fake.appPages({ slug: "/new-parent" }));

      const page = await seed("appPages", fake.appPages({ slug: "/moving-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleParentChangeWithTree(page.id, { parent: newParent.id });

      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe(page.id);
      expect(updates[0].newSlug).toBe("/new-parent/moving-page");
    });
  });

  it("should cascade slug changes to children when parent changes", async () => {
    await withTestDB(async ({ seed }) => {
      const newParent = await seed("appPages", fake.appPages({ slug: "/new-parent" }));

      const page = await seed("appPages", fake.appPages({ slug: "/moving-page" }));

      const childPage = await seed("appPages", fake.appPages({ slug: "/moving-page/child", parent: page.id }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleParentChangeWithTree(page.id, { parent: newParent.id });

      expect(updates.length).toBeGreaterThanOrEqual(2);

      const pageUpdate = updates.find((u) => u.id === page.id);
      const childUpdate = updates.find((u) => u.id === childPage.id);

      expect(pageUpdate?.newSlug).toBe("/new-parent/moving-page");
      expect(childUpdate?.newSlug).toBe("/new-parent/moving-page/child");
    });
  });

  it("should throw error when changing parent of a language page", async () => {
    await withTestDB(async ({ seed }) => {
      const primaryPage = await seed("appPages", fake.appPages({ slug: "/primary" }));

      const langPage = await seed(
        "appPages",
        fake.appPages({ slug: "/primary", lang: "fr", primaryPage: primaryPage.id }),
      );

      const newParent = await seed("appPages", fake.appPages({ slug: "/new-parent" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);

      await expect(handler.handleParentChangeWithTree(langPage.id, { parent: newParent.id })).rejects.toThrow(
        "Cannot change parent of language pages directly",
      );
    });
  });

  it("should cascade slug changes to language variants when primary page parent changes", async () => {
    await withTestDB(async ({ seed }) => {
      const newParent = await seed("appPages", fake.appPages({ slug: "/new-parent" }));

      const primaryPage = await seed("appPages", fake.appPages({ slug: "/page" }));

      // Create a language variant for the primary page
      const langPage = await seed(
        "appPages",
        fake.appPages({ slug: "/page", lang: "fr", primaryPage: primaryPage.id }),
      );

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const updates = await handler.handleParentChangeWithTree(primaryPage.id, { parent: newParent.id });

      // Should include updates for both primary and language pages
      const primaryUpdate = updates.find((u) => u.id === primaryPage.id);
      const langUpdate = updates.find((u) => u.id === langPage.id);

      expect(primaryUpdate).toBeDefined();
      expect(primaryUpdate?.newSlug).toBe("/new-parent/page");

      expect(langUpdate).toBeDefined();
    });
  });

  // ─── batchUpdateSlugs ───────────────────────────────────────────────

  it("should batch update slugs in app_pages table", async () => {
    await withTestDB(async ({ db, seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/old-slug" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      await handler.batchUpdateSlugs([{ id: page.id, newSlug: "/new-slug" }], {}, page.id, ["slug"]);

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage).not.toBeNull();
      expect(updatedPage!.slug).toBe("/new-slug");
    });
  });

  it("should batch update slugs for multiple pages", async () => {
    await withTestDB(async ({ db, seed }) => {
      const parentPage = await seed("appPages", fake.appPages({ name: "Parent", slug: "/parent" }));

      const childPage = await seed(
        "appPages",
        fake.appPages({ name: "Child", slug: "/parent/child", parent: parentPage.id }),
      );

      const handler = new SlugChangeHandler(TEST_APP_ID);
      await handler.batchUpdateSlugs(
        [
          { id: parentPage.id, newSlug: "/renamed" },
          { id: childPage.id, newSlug: "/renamed/child" },
        ],
        { name: "Renamed Parent" },
        parentPage.id,
        ["slug", "name"],
      );

      const updatedParent = await getPageById(db, parentPage.id);
      const updatedChild = await getPageById(db, childPage.id);

      expect(updatedParent).not.toBeNull();
      expect(updatedParent!.slug).toBe("/renamed");
      expect(updatedParent!.name).toBe("Renamed Parent");

      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.slug).toBe("/renamed/child");
      // Child name should not change — only the main page gets additional fields
      expect(updatedChild!.name).toBe("Child");
    });
  });

  it("should also update slugs in app_pages_online table", async () => {
    await withTestDB(async ({ db, seed }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/old-slug", online: true }));

      await seed("appPagesOnline", fake.appPages({ id: page.id, slug: "/old-slug", online: true }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      await handler.batchUpdateSlugs([{ id: page.id, newSlug: "/new-slug" }], {}, page.id, ["slug"]);

      // Check app_pages
      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage!.slug).toBe("/new-slug");

      // Check app_pages_online
      const onlinePages = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, page.id),
      });
      expect(onlinePages).toHaveLength(1);
      expect(onlinePages[0].slug).toBe("/new-slug");
    });
  });

  // ─── Cross-app isolation ────────────────────────────────────────────

  it("should not detect slug changes for pages in another app", async () => {
    await withTestDB(async ({ seed }) => {
      const otherApp = await seed("apps", { name: "Other App" });

      const page = await seed("appPages", fake.appPages({ app: otherApp.id, slug: "/other-page" }));

      const handler = new SlugChangeHandler(TEST_APP_ID);
      const changed = await handler.isSlugChanged(page.id, "/new-slug");
      // Page isn't found under this appId, so returns false
      expect(changed).toBe(false);
    });
  });
});
