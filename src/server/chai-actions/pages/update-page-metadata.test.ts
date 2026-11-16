import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { assertPageExists, getPageById } from "~/tests/utils/assertions";
import { UpdatePageMetadataAction } from "./update-page-metadata";

describe("UpdatePageMetadataAction - Integration", () => {
  it("returns page details revalidation tags only", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      const result = await action(UpdatePageMetadataAction).run({
        id: page.id,
        metadata: { title: "Updated Title" },
      });

      expect(result.tags).toContain(`page-${page.id}`);
      expect(result.tags).not.toContain("pages-metadata");
    });
  });

  it("should update page metadata in the database", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      const metadata = { title: "Updated Title", description: "Updated description" };

      const result = await action(UpdatePageMetadataAction).run({
        id: page.id,
        metadata,
      });

      expect(result.success).toBe(true);

      await assertPageExists(db, page.id);

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage).not.toBeNull();
      expect((updatedPage?.metadata as any)?.title).toBe("Updated Title");
      expect((updatedPage?.metadata as any)?.description).toBe("Updated description");
    });
  });

  it("flags the page as pending publish, keeping existing markers", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const fresh = await seed("appPages", fake.appPages({ changes: null }));
      const edited = await seed("appPages", fake.appPages({ changes: ["Page"] }));

      await action(UpdatePageMetadataAction).run({ id: fresh.id, metadata: { a: 1 } });
      await action(UpdatePageMetadataAction).run({ id: edited.id, metadata: { a: 1 } });
      await action(UpdatePageMetadataAction).run({ id: edited.id, metadata: { a: 2 } });

      expect((await getPageById(db, fresh.id))?.changes).toEqual(["Updated"]);
      expect((await getPageById(db, edited.id))?.changes).toEqual(["Page", "Updated"]);
    });
  });

  it("should overwrite existing metadata", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ metadata: { oldKey: "oldValue" } }));

      const newMetadata = { newKey: "newValue" };

      const result = await action(UpdatePageMetadataAction).run({
        id: page.id,
        metadata: newMetadata,
      });

      expect(result.success).toBe(true);

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage).not.toBeNull();
      expect(updatedPage!.metadata).toBeDefined();
      expect((updatedPage?.metadata as any)?.newKey).toBe("newValue");
      expect((updatedPage?.metadata as any)?.oldKey).toBeUndefined();
    });
  });

  it("should throw error when page does not exist", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(UpdatePageMetadataAction).run({
          id: randomUUID(),
          metadata: { key: "value" },
        }),
      ).rejects.toThrow("Page not found");
    });
  });

  it("should validate required fields", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(UpdatePageMetadataAction).run({
          id: "",
          metadata: { key: "value" },
        }),
      ).rejects.toThrow();
    });
  });

  it("should not update metadata of a page belonging to another app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const otherApp = await seed("apps", { name: "Other App" });

      const page = await seed("appPages", fake.appPages({ app: otherApp.id }));

      await expect(
        action(UpdatePageMetadataAction).run({
          id: page.id,
          metadata: { key: "value" },
        }),
      ).rejects.toThrow("Page not found");
    });
  });
});
