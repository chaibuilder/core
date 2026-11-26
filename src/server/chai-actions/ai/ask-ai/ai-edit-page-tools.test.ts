import { describe, expect, it } from "vitest";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { useTestChaiConfig, withChaiConfig } from "~/tests/setup/chai-config";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";
import { loadWebBlocks } from "~/web-blocks";
import { buildAiEditPageTools, extractBlockHtmlSlices, isValidAiBindingTemplate } from "./ai-edit-page-tools";

loadWebBlocks();

const PAGE_HTML = `
<div bid="root-1" class="page">
  <section bid="hero-1" chai-name="Hero Section" class="hero">
    <h1 bid="heading-1">Welcome</h1>
    <p bid="para-1">Sub text</p>
  </section>
  <chai-product-card chai-type="ProductCard" bid="card-1" product-id="p1"></chai-product-card>
</div>
`;

describe("extractBlockHtmlSlices", () => {
  it("returns the full outerHTML of a matched block including descendants", () => {
    const result = extractBlockHtmlSlices(PAGE_HTML, ["hero-1"]);
    // himalaya stringifies attributes with single quotes
    expect(result["hero-1"]).toMatch(/bid='hero-1'/);
    expect(result["hero-1"]).toMatch(/bid='heading-1'/);
    expect(result["hero-1"]).toContain("Welcome");
  });

  it("extracts multiple blocks in one call", () => {
    const result = extractBlockHtmlSlices(PAGE_HTML, ["heading-1", "card-1"]);
    expect(result["heading-1"]).toContain("<h1");
    expect(result["card-1"]).toContain("chai-product-card");
    expect(Object.keys(result)).toHaveLength(2);
  });

  it("returns an error message for unknown bids", () => {
    const result = extractBlockHtmlSlices(PAGE_HTML, ["nope-1"]);
    expect(result["nope-1"]).toContain("ERROR");
    expect(result["nope-1"]).toContain("nope-1");
  });

  it("does not search inside an already matched block twice", () => {
    const result = extractBlockHtmlSlices(PAGE_HTML, ["hero-1", "heading-1"]);
    expect(result["hero-1"]).toMatch(/bid='heading-1'/);
    // heading-1 is inside hero-1; the parent slice already contains it, so it
    // is not extracted separately — the entry explains where to find it.
    expect(result["heading-1"]).toBeDefined();
  });
});

describe("isValidAiBindingTemplate", () => {
  const paths = {
    global: ["global.company.name"],
    page: ["listing.price", "tags"],
    arrays: [
      {
        path: "products",
        scope: "page" as const,
        itemType: "object",
        itemFields: [
          { name: "title", type: "string" },
          { name: "price", type: "number" },
        ],
      },
    ],
  };

  it("allows advertised paths and registered value formatters", () => {
    expect(isValidAiBindingTemplate("{{listing.price | currency 'USD'}}", "content", paths)).toBe(true);
    expect(isValidAiBindingTemplate("{{$index.title | uppercase}}", "content", paths)).toBe(true);
  });

  it("rejects unadvertised paths and context-invalid boolean formatters", () => {
    expect(isValidAiBindingTemplate("{{listing.cost | currency 'USD'}}", "content", paths)).toBe(false);
    expect(isValidAiBindingTemplate("{{listing.price | gt 0}}", "content", paths)).toBe(false);
    expect(isValidAiBindingTemplate("{{listing.price | gt 0}}", "_show", paths)).toBe(true);
  });

  // The runtime skips unregistered pipes, but the model must still stick to the advertised catalog.
  it("rejects formatters that are not registered", () => {
    expect(isValidAiBindingTemplate("{{listing.price | money '$xx'}}", "content", paths)).toBe(false);
    expect(isValidAiBindingTemplate("{{listing.price | invented}}", "content")).toBe(false);
  });
});

describe("get_pages_list", () => {
  const ABOUT_ID = "11111111-1111-4111-8111-111111111111";

  const getPagesList = (scopedBlockId?: string): Promise<any> =>
    withTestDB(({ inRequest }) =>
      inRequest(() => (buildAiEditPageTools({ pageHtml: "", scopedBlockId }) as any).get_pages_list.execute({})),
    );

  const seedPages = () =>
    withTestDB(({ seedMany }) =>
      seedMany("appPages", [
        { id: ABOUT_ID, name: "About", slug: "/about", lang: "", pageType: "page" },
        { id: "home", name: "Home", slug: "/", lang: "", pageType: "page" },
        // Not linkable: a folder, a partial, a dynamic page, a language variant, a deleted page.
        { id: "docs", name: "Docs", slug: "/docs", lang: "", pageType: "_folder" },
        { id: "header", name: "Header", slug: "", lang: "", pageType: "global" },
        { id: "products", name: "Product", slug: "/products", lang: "", pageType: "product", dynamic: true },
        { id: "about-fr", name: "À propos", slug: "/fr/a-propos", lang: "fr", pageType: "page", primaryPage: ABOUT_ID },
        { id: "old", name: "Old", slug: "/old", lang: "", pageType: "page", deletedAt: new Date().toISOString() },
      ]),
    );

  it("lists routable pages (including language variants) with ready-to-use linkRef and parent metadata", async () => {
    await seedPages();
    const result = await getPagesList();
    expect(result.pages).toEqual([
      { id: "home", name: "Home", slug: "/", lang: "en", pageType: "page", parentId: null, parentSlug: null, linkRef: "pageType:page:home" },
      { id: ABOUT_ID, name: "About", slug: "/about", lang: "en", pageType: "page", parentId: null, parentSlug: null, linkRef: `pageType:page:${ABOUT_ID}` },
      { id: "about-fr", name: "À propos", slug: "/fr/a-propos", lang: "fr", pageType: "page", parentId: null, parentSlug: null, linkRef: `pageType:page:${ABOUT_ID}` },
    ]);
    expect(result.note).toContain("linkRef");
  });

  it("is available to a block-scoped run", async () => {
    await seedPages();
    expect((await getPagesList("hero-1")).pages).toHaveLength(3);
  });
});

describe("get_partial_blocks nesting filter", () => {
  // MAX_PARTIAL_DEPTH = 3. Chain mega -> layout -> header (partialBlocks columns
  // hold the closure); footer is an unused leaf. This is the same fixture as the
  // depth3 twin; both run against the real constant and real rows.
  const PARTIAL_PAGES = [
    { id: "header", name: "Header", partialBlocks: "" },
    { id: "footer", name: "Footer", partialBlocks: "" },
    { id: "layout", name: "Layout", partialBlocks: "header" },
    { id: "mega", name: "Mega", partialBlocks: "layout|header" },
  ];

  /** Partials are slug-less, language-less pages of the test app. */
  const seedPartials = (rows: { id: string; name: string; partialBlocks: string }[]) =>
    withTestDB(({ seedMany }) =>
      seedMany(
        "appPages",
        rows.map((row) => ({ ...row, slug: "", lang: "", pageType: "global", metadata: {} })),
      ),
    );

  /** Runs get_partial_blocks the way the action does: inside the request for the test app. */
  const getPartialBlocks = (pageId?: string): Promise<any> =>
    withTestDB(({ inRequest }) =>
      inRequest(() => (buildAiEditPageTools({ pageHtml: "", pageId }) as any).get_partial_blocks.execute({})),
    );

  it("lists every partial when editing a regular page", async () => {
    // Budget on a page is the full MAX_PARTIAL_DEPTH (3), so even mega (depth 3) fits.
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("page-1");
    expect(Object.keys(result.partials).sort()).toEqual(["footer", "header", "layout", "mega"]);
    expect(result.note).toBeUndefined();
  });

  it("excludes the partial being edited (self-nesting)", async () => {
    // Editing footer (fresh leaf): budget 3 - 1 = 2. header (1) and layout (2)
    // fit; mega (3) is too deep; footer is excluded as self.
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("footer");
    expect(Object.keys(result.partials).sort()).toEqual(["header", "layout"]);
    expect(result.partials.footer).toBeUndefined();
  });

  it("excludes a partial too deep to fit while allowing a nested one that does", async () => {
    // Editing footer (budget 2): a non-leaf that fits (layout, depth 2) is now
    // allowed — the depth-3 relaxation — while mega (depth 3) is still excluded.
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("footer");
    expect(result.partials.layout).toBeDefined();
    expect(result.partials.mega).toBeUndefined();
    expect(result.note).toContain("editing a partial");
  });

  it("returns no partials when the edited partial is already used inside another partial", async () => {
    // header is nested two deep (mega -> layout -> header), so its budget is 0.
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("header");
    expect(result.partials).toEqual({});
    expect(result.note).toContain("maximum nesting depth");
  });

  it("keeps the full list when no pageId is provided", async () => {
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks(undefined);
    expect(Object.keys(result.partials).sort()).toEqual(["footer", "header", "layout", "mega"]);
  });

  it("only offers this app's live partials (not pages with a slug, other apps, or trashed rows)", async () => {
    await seedPartials([{ id: "header", name: "Header", partialBlocks: "" }]);
    await withTestDB(async ({ seed }) => {
      const otherApp = await seed("apps");
      await seed("appPages", { id: "home", name: "Home", slug: "/home", lang: "", pageType: "global" });
      await seed("appPages", { id: "localized", name: "Localized", slug: "", lang: "fr", pageType: "global" });
      await seed("appPages", {
        id: "trashed",
        name: "Trashed",
        slug: "",
        lang: "",
        pageType: "global",
        deletedAt: new Date().toISOString(),
      });
      await seed("appPages", { id: "foreign", name: "Foreign", slug: "", lang: "", pageType: "global", app: otherApp.id });
    });

    const result = await getPartialBlocks("page-1");
    expect(Object.keys(result.partials)).toEqual(["header"]);
    expect(result.partials.header).toEqual({ name: "Header", description: "", type: "global", tags: [] });
  });

  it("excludes slug-less rows whose pageType is not a partial and returns partial tags", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPages", {
        id: "nav-partial",
        name: "Nav",
        slug: "",
        lang: "",
        pageType: "global",
        metadata: { description: "Main nav", [PARTIAL_TAGS_METADATA_KEY]: ["navigation", "header"] },
      });
      // A routable page whose slug hasn't been assigned yet must NOT appear as a partial.
      await seed("appPages", {
        id: "draft-unrouted",
        name: "Draft Page",
        slug: "",
        lang: "",
        pageType: "page",
        metadata: {},
      });
    });

    const result = await getPartialBlocks("page-1");
    expect(Object.keys(result.partials)).toEqual(["nav-partial"]);
    expect(result.partials["nav-partial"]).toEqual({
      name: "Nav",
      description: "Main nav",
      type: "global",
      tags: ["navigation", "header"],
    });
  });

  it("surfaces a failed partial lookup", async () => {
    await withTableUnavailable(schema.appPages, async () => {
      await expect(getPartialBlocks("page-1")).rejects.toThrow(/Failed to fetch partial blocks/);
    });
  });
});

describe("JSON blocks, multilingual, SEO & design-system tools", () => {
  const sampleBlocks = [
    { _id: "sec-1", _type: "Box", styles: "#styles:,p-8" },
    {
      _id: "h-1",
      _type: "Heading",
      _parent: "sec-1",
      tag: "h1",
      content: "Welcome",
      "content-fr": "Bienvenue",
      styles: "#styles:,text-4xl",
    },
  ];

  it("reads language-view HTML from JSON blocks and raw translations from get_block_translations", async () => {
    const tools = buildAiEditPageTools({
      blocks: sampleBlocks,
      pageId: "page-fr",
      primaryPageId: "page-en",
      pageName: "Accueil",
      pageSlug: "/fr",
      lang: "fr",
      fallbackLang: "en",
      variantLangs: ["fr"],
    }) as any;

    const slices = await tools.read_block_html.execute({ blockIds: ["h-1"] });
    expect(slices["h-1"]).toContain("Bienvenue");
    expect(slices["h-1"]).not.toContain("Welcome");

    const jsonRead = await tools.read_blocks.execute({ blockIds: ["sec-1"], includeDescendants: true });
    expect(jsonRead.lang).toBe("fr");
    expect(jsonRead.blocks.map((b: any) => b._id)).toEqual(["sec-1", "h-1"]);
    expect(jsonRead.blocks.find((b: any) => b._id === "h-1").content).toBe("Bienvenue");

    const singleRead = await tools.read_blocks.execute({ blockIds: ["sec-1", "missing-id"] });
    expect(singleRead.blocks.map((b: any) => b._id)).toEqual(["sec-1"]);
    expect(singleRead.missingIds).toEqual(["missing-id"]);

    const scopedTools = buildAiEditPageTools({
      blocks: sampleBlocks,
      scopedBlockId: "sec-1",
      lang: "fr",
      fallbackLang: "en",
    }) as any;
    const scopedOk = await scopedTools.read_blocks.execute({ blockIds: ["h-1"] });
    expect(scopedOk.blocks.map((b: any) => b._id)).toEqual(["h-1"]);
    const scopedRejected = await scopedTools.read_blocks.execute({ blockIds: ["outside-1"] });
    expect(scopedRejected).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining("outside the current edit scope") }),
    );

    const pageBlocks = await tools.get_page_blocks.execute({});
    expect(pageBlocks.lang).toBe("fr");
    expect(pageBlocks.isLanguageVariant).toBe(true);
    expect(pageBlocks.blocks.find((b: any) => b._id === "h-1").content).toBe("Bienvenue");

    const translations = await tools.get_block_translations.execute({});
    expect(translations.lang).toBe("fr");
    expect(translations.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: "h-1", prop: "content", source: "Welcome", translation: "Bienvenue" }),
      ]),
    );

    const invalidLang = await tools.get_block_translations.execute({ lang: "de" });
    expect(invalidLang.error).toContain("not a configured site language");
  });

  it("reads real site design system, tokens and theme from apps row in get_design_system and check_page_design", async () => {
    useTestChaiConfig({});
    withChaiConfig({
      features: {
        ...getActiveChaiBuilderConfig().features,
        designSystem: { enabled: true, designChecks: "warn" },
      } as never,
    });

    await withTestDB(async ({ db, seed, inRequest }) => {
      const { eq } = await import("drizzle-orm");
      await db
        .update(schema.apps)
        .set({
          name: "Acme Studio",
          fallbackLang: "en",
          languages: ["fr"],
          designTokens: { "dt#acme-card": { name: "Acme Card", value: "rounded-xl p-6 bg-card" } } as any,
          ai: {
            bannedWords: "synergy",
            designSystem: {
              version: 1,
              enabled: true,
              northStar: "Swiss Editorial",
              mode: "read",
              overview: "Clean grid",
              colors: "Monochrome + vermilion",
              typography: "Tight display",
              layout: "Generous whitespace",
              elevation: "Flat",
              shapes: "Sharp",
              components: "dt#acme-card",
              dosAndDonts: "No fluff",
            },
          } as any,
        })
        .where(eq(schema.apps.id, (await seed("appPages", { id: "ds-p1", name: "Home", slug: "/", lang: "" })).app));

      await inRequest(
        async () => {
          const tools = buildAiEditPageTools({
            blocks: [
              { _id: "sec-1", _type: "Box", styles: "#styles:,dt#acme-card" },
              { _id: "h-1", _type: "Heading", _parent: "sec-1", tag: "h1", content: "Welcome", styles: "#styles:,text-4xl" },
            ],
            pageId: "ds-p1",
            primaryPageId: "ds-p1",
            pageName: "Home",
            pageSlug: "/",
          }) as any;

          const ds = await tools.get_design_system.execute({});
          expect(ds.ok).toBe(true);
          expect(ds.status).toBe("ready");
          expect(ds.brief).toContain("Swiss Editorial");
          expect(ds.brief).toContain("dt#acme-card");
          expect(ds.brief).toContain("Acme Studio");

          const check = await tools.check_page_design.execute({});
          expect(check.ok).toBe(true);
          expect(check.report).toContain("The site's design system is enabled");
          expect(check.report).not.toContain("unknown-design-token");

          const pagesList = await tools.get_pages_list.execute({});
          expect(pagesList.fallbackLang).toBe("en");
          expect(pagesList.languages).toEqual(["fr"]);
        },
        { permissions: ["ai:read", "ai:use", "pages:read"] },
      );
    });
  });

  it("reads and updates draft SEO on the active page via get_page_seo and update_page_seo", async () => {
    await withTestDB(async ({ seed, inRequest }) => {
      await seed("appPages", {
        id: "seo-page",
        name: "About",
        slug: "/about",
        lang: "",
        pageType: "page",
        seo: { title: "Old Title", description: "Old Desc" },
      });

      await inRequest(
        async () => {
          const tools = buildAiEditPageTools({
            blocks: sampleBlocks,
            pageId: "seo-page",
            primaryPageId: "seo-page",
            pageName: "About",
            pageSlug: "/about",
            lang: "en",
            fallbackLang: "en",
          }) as any;

          const before = await tools.get_page_seo.execute({});
          expect(before.seo.title).toBe("Old Title");
          expect(before.seo.description).toBe("Old Desc");

          const updated = await tools.update_page_seo.execute({
            title: "New Title",
            metaOther: [{ name: "author", content: "Acme" }],
            jsonLD: JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage" }),
          });
          expect(updated).toEqual({ ok: true, pageId: "seo-page", changedKeys: ["title", "metaOther", "jsonLD"] });

          const after = await tools.get_page_seo.execute({});
          expect(after.seo.title).toBe("New Title");
          expect(after.seo.description).toBe("Old Desc");
          expect(after.metaTags.metaOther).toEqual({ author: "Acme" });
          expect(after.jsonLD).toEqual({ "@context": "https://schema.org", "@type": "WebPage" });
        },
        { permissions: ["pages:read", "pages:update", "pages:edit_seo"] },
      );
    });
  });

  it("gates design system tools on feature flag and keeps theme/token mutations MCP-only", async () => {
    useTestChaiConfig({});
    withChaiConfig({
      features: {
        ...getActiveChaiBuilderConfig().features,
        designSystem: { enabled: true, designChecks: "warn" },
      } as never,
    });

    const tools = buildAiEditPageTools({
      blocks: sampleBlocks,
      pageId: "p1",
    }) as any;
    expect(tools.get_design_system).toBeDefined();
    expect(tools.save_design_system).toBeDefined();
    expect(tools.check_page_design).toBeDefined();
    expect(tools.get_design_guide).toBeDefined();
    expect(tools.update_site_theme).toBeUndefined();
    expect(tools.update_design_tokens).toBeUndefined();

    const guide = await tools.get_design_guide.execute({ topic: "craft-floor" });
    expect(guide.ok).toBe(true);
    expect(guide.guide).toContain("Craft floor");
  });
});
