import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { UpdatePageAction } from "./update-page";

describe("UpdatePageAction - Routing (Slug/Parent) Integration", () => {
  it("should handle slug updates", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange
      const page = await seed("appPages", fake.appPages({ slug: "/old-slug", parent: null }));

      const payload = {
        id: page.id,
        slug: "/new-slug",
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert
      expect(result.page).toBeDefined();

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage).not.toBeNull();
      expect(updatedPage?.slug).toBe("/new-slug");
      expect(result.tags).toContain(`page-${page.id}`);
      expect(result.tags).toContain(`breadcrumb-${page.id}`);
    });
  });

  it("should handle parent updates", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange
      const parentPage = await seed("appPages", fake.appPages({ slug: "/parent" }));
      const childPage = await seed("appPages", fake.appPages({ slug: "/old-child", parent: null }));

      const payload = {
        id: childPage.id,
        parent: parentPage.id,
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert
      expect(result.page).toBeDefined();

      const updatedChild = await getPageById(db, childPage.id);
      expect(updatedChild).not.toBeNull();
      expect(updatedChild?.parent).toBe(parentPage.id);
      expect(updatedChild?.slug).toBe("/parent/old-child");
    });
  });
});
