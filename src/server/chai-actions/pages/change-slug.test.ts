import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { UpdatePageAction } from "./update-page";

describe("Change Slug - Integration", () => {
  it("should change slug for a page and its children", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Create a parent page
      const parentPage = await seed("appPages", fake.appPages({ name: "Parent Page", slug: "/parent" }));

      // 2. Create a child page
      const childPage = await seed(
        "appPages",
        fake.appPages({ name: "Child Page", slug: "/parent/child", parent: parentPage.id }),
      );

      // 3. Update the parent page slug
      await action(UpdatePageAction).run({
        id: parentPage.id,
        slug: "/new-parent",
      });

      // 4. Verify the parent page slug is updated
      const updatedParent = await getPageById(db, parentPage.id);
      expect(updatedParent).toBeDefined();
      expect(updatedParent?.slug).toBe("/new-parent");

      // 5. Verify the child page slug is also updated
      const updatedChild = await getPageById(db, childPage.id);
      expect(updatedChild).toBeDefined();
      expect(updatedChild?.slug).toBe("/new-parent/child");
    });
  });
});
