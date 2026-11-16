/**
 * `resolveLink(ref, lang)` outside `getPagePayload` — data providers, sitemap
 * and feed builders call it on a fresh request state. The fallback language
 * must come from the site settings there: with a hardcoded "en" default,
 * `lang === fallbackLang` collapsed the lookup to the primary row and an EN
 * listing on a French-default site linked every card to the French VDP root.
 */
import { describe, expect, it } from "vitest";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { setFallbackLang } from "../internal/init";
import { resolveLink } from "./resolve-link";

async function seedFrenchSite() {
  await withTestDB(async ({ seedMany, seedUpdate }) => {
    await seedUpdate("apps", { id: TEST_APP_ID }, { fallbackLang: "fr" });
    await seedUpdate("appsOnline", { id: TEST_APP_ID }, { fallbackLang: "fr" });
    await seedMany("appPagesOnline", [
      { id: "fr-used", slug: "/occasion", lang: "", primaryPage: null },
      { id: "en-used", slug: "/en/pre-owned", lang: "en", primaryPage: "fr-used" },
    ]);
  });
  installMemoryPersistentCache();
}

describe("resolveLink outside getPagePayload", () => {
  it("reads the site default from settings on a fresh request state", async () => {
    await seedFrenchSite();
    const slug = await withTestDB(({ inRequest }) =>
      inRequest(() => resolveLink("pageType:page:fr-used", "en"), { draft: false }),
    );
    expect(slug).toBe("/en/pre-owned");
  });

  it("returns the translated slug for the non-default language once the site default is seeded", async () => {
    await seedFrenchSite();
    const slug = await withTestDB(({ inRequest }) =>
      inRequest(
        () => {
          setFallbackLang("fr");
          return resolveLink("pageType:page:fr-used", "en");
        },
        { draft: false },
      ),
    );
    expect(slug).toBe("/en/pre-owned");
  });

  it("returns the primary slug for the seeded site default language", async () => {
    await seedFrenchSite();
    const slug = await withTestDB(({ inRequest }) =>
      inRequest(
        () => {
          setFallbackLang("fr");
          return resolveLink("pageType:page:fr-used", "fr");
        },
        { draft: false },
      ),
    );
    expect(slug).toBe("/occasion");
  });

  it("keeps the settings-derived default across repeated calls in one request state", async () => {
    await seedFrenchSite();
    const slugs = await withTestDB(({ inRequest }) =>
      inRequest(
        async () => [
          await resolveLink("pageType:page:fr-used", "en"),
          await resolveLink("pageType:page:fr-used", "fr"),
          await resolveLink("pageType:page:fr-used", "en"),
        ],
        { draft: false },
      ),
    );
    expect(slugs).toEqual(["/en/pre-owned", "/occasion", "/en/pre-owned"]);
  });
});
