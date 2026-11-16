/**
 * Primary pages store an empty `lang`, so `getPages` labels them with the site
 * default. On a request state that never ran `getPagePayload` (the MCP
 * `get_pages_list` tool) that default must come from the site settings, not a
 * hardcoded "en" — otherwise every French primary page is reported as English.
 */
import { describe, expect, it } from "vitest";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPages } from "./get-pages";

describe("getPages", () => {
  it("labels primary pages with the site default language from settings", async () => {
    await withTestDB(async ({ seedMany, seedUpdate }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { fallbackLang: "fr" });
      await seedMany("appPages", [
        { id: "fr-blog", slug: "/blogue", lang: "", primaryPage: null },
        { id: "en-blog", slug: "/en/blog", lang: "en", primaryPage: "fr-blog" },
      ]);
    });
    installMemoryPersistentCache();

    const pages = await withTestDB(({ inRequest }) => inRequest(() => getPages("draft"), { draft: true }));

    expect(Object.fromEntries(pages.map((p) => [p.id, p.lang]))).toEqual({ "fr-blog": "fr", "en-blog": "en" });
  });
});
