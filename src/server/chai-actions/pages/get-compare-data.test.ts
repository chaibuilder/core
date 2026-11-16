import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { GetCompareDataAction } from "./get-compare-data";

const OTHER_APP = "another-tenant-app";

/**
 * `compare_page_revisions` (MCP) hands this action two caller-supplied ids over
 * a public HTTP API, and all three source tables are shared across tenants —
 * so each lookup is scoped by app and a foreign row must read as VERSION_NOT_FOUND.
 */
describe("GetCompareDataAction - app scoping", () => {
  it("compares two versions belonging to the caller's app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed(
        "appPages",
        fake.appPages({ blocks: [{ _id: "a", _type: "Text", content: "draft" }], seo: { title: "Draft" } }),
      );
      const revision = await seed("appPagesRevisions", {
        app: TEST_APP_ID,
        id: page.id,
        name: page.name,
        slug: page.slug,
        lang: "",
        blocks: [{ _id: "a", _type: "Text", content: "old" }],
        seo: { title: "Old" },
      });

      const result = await action(GetCompareDataAction).run({
        versions: {
          version1: { type: "revision", id: revision.uid },
          version2: { type: "draft", id: page.id },
        },
      });

      expect((result.version1.seo as { title: string }).title).toBe("Old");
      expect((result.version2.seo as { title: string }).title).toBe("Draft");

      // pageId is carried outside the version objects so the builder's diff-tab
      // enumeration (Object.keys of each version) never surfaces a "pageId" tab.
      expect(result.version1).not.toHaveProperty("pageId");
      expect(result.version2).not.toHaveProperty("pageId");
      expect(result.pageIds).toEqual({ version1: page.id, version2: page.id });
    });
  });

  it("refuses a revision uid from another app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed("appPages", fake.appPages());
      const revision = await seed("appPagesRevisions", {
        app: TEST_APP_ID,
        id: page.id,
        name: page.name,
        slug: page.slug,
        lang: "",
        blocks: [{ _id: "a", _type: "Text", content: "secret" }],
      });

      await expect(
        action(GetCompareDataAction, { appId: OTHER_APP }).run({
          versions: {
            version1: { type: "revision", id: revision.uid },
            version2: { type: "revision", id: revision.uid },
          },
        }),
      ).rejects.toThrow();
    });
  });

  it("refuses a draft page id from another app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await expect(
        action(GetCompareDataAction, { appId: OTHER_APP }).run({
          versions: {
            version1: { type: "draft", id: page.id },
            version2: { type: "draft", id: page.id },
          },
        }),
      ).rejects.toThrow();
    });
  });
});
