import { afterEach, describe, expect, it } from "vitest";
import {
  getChaiPageVersionSource,
  registerChaiPageVersionSource,
  resetChaiPageVersionSourcesForTests,
  type ChaiPageVersionLoader,
} from "~/server/plugin-api/page-version-sources";
import { fake } from "~/tests/setup/fakers";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { GetCompareDataAction } from "./get-compare-data";

const OTHER_APP = "another-tenant-app";

// `revision` versions come from whichever plugin registered a loader for them. After a test swaps
// in its own, the edition's loader is put back, or the registry emptied when it has none.
const editionRevisionSource = getChaiPageVersionSource("revision");
afterEach(() => {
  if (editionRevisionSource) registerChaiPageVersionSource("revision", editionRevisionSource);
  else resetChaiPageVersionSourcesForTests();
});

/**
 * `compare_page_revisions` (MCP) hands this action two caller-supplied ids over
 * a public HTTP API, and every source table is shared across tenants — so each
 * lookup is scoped by app and a foreign row must read as VERSION_NOT_FOUND.
 */
describe("GetCompareDataAction", () => {
  it("compares a page's draft with its live version", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed(
        "appPages",
        fake.appPages({ blocks: [{ _id: "a", _type: "Text", content: "draft" }], seo: { title: "Draft" } }),
      );
      await seed("appPagesOnline", fake.appPagesOnline({ id: page.id, slug: page.slug, seo: { title: "Live" } }));

      const result = await action(GetCompareDataAction).run({
        versions: { version1: { type: "live", id: page.id }, version2: { type: "draft", id: page.id } },
      });

      expect((result.version1.seo as { title: string }).title).toBe("Live");
      expect((result.version2.seo as { title: string }).title).toBe("Draft");
      // pageId is carried outside the version objects so the builder's diff-tab
      // enumeration (Object.keys of each version) never surfaces a "pageId" tab.
      expect(result.version1).not.toHaveProperty("pageId");
      expect(result.pageIds).toEqual({ version1: page.id, version2: page.id });
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

  it("reads a plugin-stored version through the loader registered for its type", async () => {
    const calls: { appId: string; id: string }[] = [];
    const loader: ChaiPageVersionLoader = async (args) => {
      calls.push(args);
      return args.id === "rev-1" ? { pageId: "page-1", blocks: [], seo: { title: "Stored" }, tracking: {} } : null;
    };
    registerChaiPageVersionSource("revision", loader);

    await withTestDB(async ({ action }) => {
      const result = await action(GetCompareDataAction).run({
        versions: { version1: { type: "revision", id: "rev-1" }, version2: { type: "revision", id: "rev-1" } },
      });
      expect((result.version1.seo as { title: string }).title).toBe("Stored");
      expect(result.pageIds.version1).toBe("page-1");
      // The loader is handed the caller's app, never one from the request body.
      expect(calls[0]).toEqual({ appId: TEST_APP_ID, id: "rev-1" });

      await expect(
        action(GetCompareDataAction).run({
          versions: { version1: { type: "revision", id: "missing" }, version2: { type: "draft", id: "x" } },
        }),
      ).rejects.toThrow("No data found for revision version with id: missing");
    });
  });
});
