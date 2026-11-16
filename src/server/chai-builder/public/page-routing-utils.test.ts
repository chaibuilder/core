import { describe, expect, it } from "vitest";
import {
  findMatchingDynamicPages,
  findPageBySlug,
  getPaginationBaseSlug,
  inheritDynamicFlagsFromPrimary,
} from "~/server/chai-builder/public/find-page-by-slug";
import type { PageRoutingMetadata } from "~/server/chai-builder/public/page-routing-cache";

const staticPage = (overrides: Partial<PageRoutingMetadata> = {}): PageRoutingMetadata => ({
  id: "static-1",
  name: "About",
  slug: "/about",
  lang: "en",
  primaryPage: null,
  pageType: "page",
  dynamic: false,
  dynamicSlugCustom: null,
  parent: null,
  ...overrides,
});

describe("findMatchingDynamicPages", () => {
  // vdp_page and inventory_make_listing both hang off /auto-usage; a hyphen-rich
  // slug matches both patterns. findPageBySlug returns only the first (registration
  // order); findMatchingDynamicPages surfaces every match so a caller can arbitrate.
  const sharedBaseTemplates: PageRoutingMetadata[] = [
    staticPage({ id: "vdp", slug: "/auto-usage", dynamic: true, pageType: "vdp_page" }),
    staticPage({ id: "seo-listing", slug: "/auto-usage", dynamic: true, pageType: "inventory_make_listing" }),
  ];
  const dynamicSegments = {
    vdp_page: "/[a-z0-9-]*-[a-z0-9-]*-[a-z0-9-]+",
    inventory_make_listing: "/[a-z0-9][a-z0-9-]*",
  };

  it("returns every matching template in registration-priority order", () => {
    const matches = findMatchingDynamicPages("/auto-usage/vus-moins-de-17000", sharedBaseTemplates, dynamicSegments);
    expect(matches.map((m) => m.id)).toEqual(["vdp", "seo-listing"]);
    // findPageBySlug keeps returning the first — the registration-order default.
    expect(findPageBySlug("/auto-usage/vus-moins-de-17000", sharedBaseTemplates, dynamicSegments).id).toBe("vdp");
  });

  it("returns a single match when only one pattern applies", () => {
    // `camion` has no hyphens, so it misses the vdp_page pattern.
    const matches = findMatchingDynamicPages("/auto-usage/camion", sharedBaseTemplates, dynamicSegments);
    expect(matches.map((m) => m.id)).toEqual(["seo-listing"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(findMatchingDynamicPages("/blog/post", sharedBaseTemplates, dynamicSegments)).toEqual([]);
  });

  it("matches regex characters in the template slug literally", () => {
    const pages = [staticPage({ id: "dot", slug: "/promo/v.p", dynamic: true, pageType: "vdp_page" })];
    expect(findMatchingDynamicPages("/promo/v.p/a-b-c", pages, dynamicSegments).map((m) => m.id)).toEqual(["dot"]);
    expect(findMatchingDynamicPages("/promo/vxp/a-b-c", pages, dynamicSegments)).toEqual([]);
  });

  it("skips a template whose pattern does not compile instead of throwing", () => {
    const pages = [
      staticPage({ id: "bad", slug: "/auto-usage", dynamic: true, pageType: "vdp_page", dynamicSlugCustom: "(" }),
      ...sharedBaseTemplates,
    ];
    expect(findMatchingDynamicPages("/auto-usage/camion", pages, dynamicSegments).map((m) => m.id)).toEqual([
      "seo-listing",
    ]);
  });

  it("does not throw on a template slug containing an unbalanced paren", () => {
    const pages = [staticPage({ id: "paren", slug: "/promo(", dynamic: true, pageType: "vdp_page" })];
    expect(findMatchingDynamicPages("/promo(/a-b-c", pages, dynamicSegments).map((m) => m.id)).toEqual(["paren"]);
  });
});

describe("findPageBySlug", () => {
  it("matches static pages by exact slug", () => {
    const pages = [staticPage(), staticPage({ id: "static-2", slug: "/contact" })];
    const result = findPageBySlug("/about", pages, {});
    expect(result.id).toBe("static-1");
  });

  it("throws when no page matches", () => {
    expect(() => findPageBySlug("/missing", [staticPage()], {})).toThrow("PAGE_NOT_FOUND");
  });

  it("matches dynamic pages via regex pattern", () => {
    const pages: PageRoutingMetadata[] = [
      staticPage({ id: "blog-template", slug: "/blog", dynamic: true, pageType: "blog" }),
    ];
    const dynamicSegments = { blog: "/[^/]+" };

    const result = findPageBySlug("/blog/my-post", pages, dynamicSegments);
    expect(result.id).toBe("blog-template");
  });

  it("prefers longer dynamic slug paths", () => {
    const pages: PageRoutingMetadata[] = [
      staticPage({ id: "blog", slug: "/blog", dynamic: true, pageType: "blog" }),
      staticPage({ id: "blog-category", slug: "/blog/category", dynamic: true, pageType: "blogCategory" }),
    ];
    const dynamicSegments = {
      blog: "/[^/]+",
      blogCategory: "/[^/]+",
    };

    const result = findPageBySlug("/blog/category/tech", pages, dynamicSegments);
    expect(result.id).toBe("blog-category");
  });
});

describe("getPaginationBaseSlug", () => {
  it("returns the base slug when the last segment is numeric", () => {
    expect(getPaginationBaseSlug("/blog/2")).toBe("/blog");
    expect(getPaginationBaseSlug("/used-cars/4")).toBe("/used-cars");
    expect(getPaginationBaseSlug("/used-cars/hyundai/12")).toBe("/used-cars/hyundai");
  });

  it("returns null when there is no trailing page number", () => {
    expect(getPaginationBaseSlug("/blog")).toBeNull();
    expect(getPaginationBaseSlug("/")).toBeNull();
    expect(getPaginationBaseSlug("/blog/my-post-2024")).toBeNull();
  });

  it("returns null for root-level numeric slugs", () => {
    expect(getPaginationBaseSlug("/4")).toBeNull();
  });

  it("treats numbers above 999 as content, not a page number", () => {
    expect(getPaginationBaseSlug("/blog/999")).toBe("/blog");
    expect(getPaginationBaseSlug("/blog/1000")).toBeNull();
    expect(getPaginationBaseSlug("/listing/2434343")).toBeNull();
    // Numeric vehicle models (ram/1500) stay part of the slug.
    expect(getPaginationBaseSlug("/auto-usage/ram/1500")).toBeNull();
  });
});

describe("inheritDynamicFlagsFromPrimary", () => {
  const dynamicPrimary = staticPage({
    id: "fr-inventory",
    slug: "/inventaire",
    lang: "fr",
    pageType: "inventory_listing",
    dynamic: true,
    dynamicSlugCustom: "(/[a-z0-9-]+)?",
  });

  it("hydrates dynamic flags on alt-language rows from their dynamic primary", () => {
    const altRow = staticPage({
      id: "en-inventory",
      slug: "/en/new/inventory",
      lang: "en",
      pageType: "inventory_listing",
      primaryPage: "fr-inventory",
      dynamic: false,
      dynamicSlugCustom: null,
    });

    const [primary, enriched] = inheritDynamicFlagsFromPrimary([dynamicPrimary, altRow]);
    expect(primary).toBe(dynamicPrimary);
    expect(enriched.dynamic).toBe(true);
    expect(enriched.dynamicSlugCustom).toBe("(/[a-z0-9-]+)?");
  });

  it("keeps the alt row's own dynamicSlugCustom when present", () => {
    const altRow = staticPage({
      id: "en-inventory",
      slug: "/en/new/inventory",
      primaryPage: "fr-inventory",
      dynamic: false,
      dynamicSlugCustom: "(/[a-z]+)?",
    });

    const [, enriched] = inheritDynamicFlagsFromPrimary([dynamicPrimary, altRow]);
    expect(enriched.dynamic).toBe(true);
    expect(enriched.dynamicSlugCustom).toBe("(/[a-z]+)?");
  });

  it("leaves rows untouched when the primary is not dynamic or not present", () => {
    const staticPrimary = staticPage({ id: "fr-about", slug: "/a-propos", dynamic: false });
    const altOfStatic = staticPage({ id: "en-about", slug: "/en/about", primaryPage: "fr-about" });
    const orphanAlt = staticPage({ id: "en-orphan", slug: "/en/orphan", primaryPage: "missing" });

    const result = inheritDynamicFlagsFromPrimary([staticPrimary, altOfStatic, orphanAlt]);
    expect(result[1]).toBe(altOfStatic);
    expect(result[2]).toBe(orphanAlt);
  });

  it("lets enriched alt-language rows match dynamic URLs in findPageBySlug", () => {
    const altRow = staticPage({
      id: "en-inventory",
      slug: "/en/new/inventory",
      lang: "en",
      pageType: "inventory_listing",
      primaryPage: "fr-inventory",
      dynamic: false,
      dynamicSlugCustom: "(/[a-z0-9-]+)?",
    });
    const candidates = inheritDynamicFlagsFromPrimary([dynamicPrimary, altRow]);
    const dynamicSegments = { inventory_listing: "(/[0-9]+)?" };

    expect(findPageBySlug("/en/new/inventory/subaru-crosstrek-2026-r0878", candidates, dynamicSegments).id).toBe(
      "en-inventory",
    );
    // The template's own base URL resolves dynamically too (empty suffix).
    expect(findPageBySlug("/en/new/inventory", candidates, dynamicSegments).id).toBe("en-inventory");
    expect(findPageBySlug("/inventaire/subaru", candidates, dynamicSegments).id).toBe("fr-inventory");
  });
});
