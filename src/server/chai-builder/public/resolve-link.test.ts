/**
 * `resolveLink(ref, lang)` outside `getPagePayload` — data providers, sitemap
 * and feed builders call it on a fresh request state. `applyContext` seeds
 * `fallbackLang = "en"`, so `getFallbackLang()` answers from state without
 * querying site settings; callers on non-"en"-default sites must seed the real
 * default (`loadSiteSettings` / `setFallbackLang`) before resolving links.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setFallbackLang } from "../internal/init";
import { runInContext } from "../state";

const { mockWhere, mockSiteSettings } = vi.hoisted(() => ({
  mockWhere: vi.fn(),
  mockSiteSettings: vi.fn(),
}));

vi.mock("~/server/chai-actions/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (...args: unknown[]) => Object.assign(mockWhere(...args), { limit: () => mockWhere(...args) }) }) }),
  },
  safeQuery: async (fn: () => Promise<unknown>) => ({ data: await fn(), error: null }),
  schema: {
    appPages: { id: "id", slug: "slug", lang: "lang", primaryPage: "primaryPage", app: "app", deletedAt: "deletedAt" },
    appPagesOnline: { id: "id", slug: "slug", lang: "lang", primaryPage: "primaryPage", app: "app", deletedAt: "deletedAt" },
  },
}));

vi.mock("./get-site-settings", () => ({
  getSiteSettings: () => mockSiteSettings(),
}));

vi.mock("./cache-utils", () => ({
  withChaiCache: (fn: any) => fn,
  withRequestCache: (fn: any) => fn,
}));

vi.mock("~/server/defaults", () => ({
  getResolvedPageType: () => ({ key: "page" }),
}));

import { resolveLink } from "./resolve-link";

const rows = [
  { id: "fr-used", slug: "/occasion", lang: "", primaryPage: null },
  { id: "en-used", slug: "/en/pre-owned", lang: "en", primaryPage: "fr-used" },
];

describe("resolveLink outside getPagePayload", () => {
  beforeEach(() => {
    mockWhere.mockReset();
    mockWhere.mockResolvedValue(rows);
    mockSiteSettings.mockReset();
    mockSiteSettings.mockResolvedValue({ fallbackLang: "fr" });
  });

  it("uses the seeded \"en\" fallback without querying site settings", async () => {
    // "en" is the default, so the lookup collapses to the primary row.
    const slug = await runInContext({ appId: "app-1" }, () => resolveLink("pageType:page:fr-used", "en"));
    expect(slug).toBe("/occasion");
    expect(mockSiteSettings).not.toHaveBeenCalled();
  });

  it("returns the translated slug for the non-default language once the site default is seeded", async () => {
    const slug = await runInContext({ appId: "app-1" }, () => {
      setFallbackLang("fr");
      return resolveLink("pageType:page:fr-used", "en");
    });
    expect(slug).toBe("/en/pre-owned");
    expect(mockSiteSettings).not.toHaveBeenCalled();
  });

  it("returns the primary slug for the seeded site default language", async () => {
    const slug = await runInContext({ appId: "app-1" }, () => {
      setFallbackLang("fr");
      return resolveLink("pageType:page:fr-used", "fr");
    });
    expect(slug).toBe("/occasion");
  });

  it("never queries site settings across repeated calls in one request state", async () => {
    await runInContext({ appId: "app-1" }, async () => {
      await resolveLink("pageType:page:fr-used", "en");
      await resolveLink("pageType:page:fr-used", "fr");
    });
    expect(mockSiteSettings).not.toHaveBeenCalled();
  });
});
