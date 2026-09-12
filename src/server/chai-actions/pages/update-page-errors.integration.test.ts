import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { UpdatePageAction } from "./update-page";

describe("UpdatePageAction - Errors Integration", () => {
  it("should throw validation error for invalid payload", async () => {
    await withTestDB(async ({ action }) => {
      // 1. Act & Assert
      await expect(
        action(UpdatePageAction).run({
          id: "", // Invalid ID
        }),
      ).rejects.toThrow();
    });
  });

  it("should fail when context is not set properly", async () => {
    await withTestDB(async ({ seed }) => {
      // 1. Arrange
      const page = await seed("appPages", fake.appPages());

      // Directly instantiating action without action() from withTestDB
      // skips context setup, so it should throw CONTEXT_NOT_SET
      const updateAction = new UpdatePageAction();

      // 2. Act & Assert
      await expect(
        updateAction.execute({
          id: page.id,
        }),
      ).rejects.toThrow("Context not set");
    });
  });

  it("should enforce multi-tenant isolation and not update another app's page", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange
      const otherApp = await seed("apps", { name: "Other App" });
      const originalName = "Original Name";
      const page = await seed("appPages", fake.appPages({ app: otherApp.id, name: originalName }));

      // 2. Act
      // The action tries to update a page belonging to otherApp.
      // Due to multi-tenant isolation, the update query will affect 0 rows.
      await action(UpdatePageAction).run({
        id: page.id,
        name: "Hacked Name",
      });

      // 3. Assert
      // Verify the page in the database was NOT modified
      const unhackedPage = await getPageById(db, page.id);
      expect(unhackedPage).not.toBeNull();
      expect(unhackedPage?.name).toBe(originalName);
    });
  });

  // The builder gates folder conversion on `pages:change_type` in the dropdown only.
  // This action declares `pages:update`, which is far more widely granted, so without
  // a server-side check the permission is decorative and the one-way rule unenforced.
  describe("folder page type transitions", () => {
    const CHANGE_TYPE = { userAccess: { role: "editor", permissions: ["pages:change_type", "pages:update"] } };

    it("rejects converting a folder to a page without pages:change_type", async () => {
      await withTestDB(async ({ db, seed, action }) => {
        const folder = await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));

        await expect(action(UpdatePageAction).run({ id: folder.id, pageType: "page" })).rejects.toThrow(
          "Missing permission: pages:change_type",
        );

        const unchanged = await getPageById(db, folder.id);
        expect(unchanged?.pageType).toBe("_folder");
      });
    });

    it("allows converting a folder to a page with pages:change_type", async () => {
      await withTestDB(async ({ db, seed, action }) => {
        const folder = await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));

        await action(UpdatePageAction, CHANGE_TYPE).run({ id: folder.id, pageType: "page" });

        const converted = await getPageById(db, folder.id);
        expect(converted?.pageType).toBe("page");
      });
    });

    it("rejects the reverse conversion even with pages:change_type", async () => {
      await withTestDB(async ({ db, seed, action }) => {
        const page = await seed("appPages", fake.appPages({ slug: "/company", pageType: "page" }));

        await expect(action(UpdatePageAction, CHANGE_TYPE).run({ id: page.id, pageType: "_folder" })).rejects.toThrow(
          "A page cannot be converted to a folder",
        );

        const unchanged = await getPageById(db, page.id);
        expect(unchanged?.pageType).toBe("page");
      });
    });

    it("rejects making an existing folder dynamic", async () => {
      await withTestDB(async ({ seed, action }) => {
        const folder = await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));

        await expect(action(UpdatePageAction).run({ id: folder.id, dynamic: true })).rejects.toThrow(
          "Folder cannot be dynamic",
        );
      });
    });

    it("leaves non-folder page type changes on pages:update alone", async () => {
      await withTestDB(async ({ db, seed, action }) => {
        // Narrow by design: only folder conversions need the extra permission, so
        // callers changing other page types keep working exactly as before.
        const page = await seed("appPages", fake.appPages({ pageType: "page" }));

        await action(UpdatePageAction).run({ id: page.id, pageType: "blog" });

        const updated = await getPageById(db, page.id);
        expect(updated?.pageType).toBe("blog");
      });
    });
  });
});
