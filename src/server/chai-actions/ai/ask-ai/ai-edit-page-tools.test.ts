import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { buildAiEditPageTools, extractBlockHtmlSlices, isValidAiBindingTemplate } from "./ai-edit-page-tools";

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

  it("lists routable primary pages with a ready-to-use linkRef", async () => {
    await seedPages();
    const result = await getPagesList();
    expect(result.pages).toEqual([
      { name: "Home", slug: "/", pageType: "page", linkRef: "pageType:page:home" },
      { name: "About", slug: "/about", pageType: "page", linkRef: `pageType:page:${ABOUT_ID}` },
    ]);
    expect(result.note).toContain("linkRef");
  });

  it("is available to a block-scoped run", async () => {
    await seedPages();
    expect((await getPagesList("hero-1")).pages).toHaveLength(2);
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
      await seed("appPages", { id: "home", name: "Home", slug: "/home", lang: "" });
      await seed("appPages", { id: "localized", name: "Localized", slug: "", lang: "fr" });
      await seed("appPages", {
        id: "trashed",
        name: "Trashed",
        slug: "",
        lang: "",
        deletedAt: new Date().toISOString(),
      });
      await seed("appPages", { id: "foreign", name: "Foreign", slug: "", lang: "", app: otherApp.id });
    });

    const result = await getPartialBlocks("page-1");
    expect(Object.keys(result.partials)).toEqual(["header"]);
    expect(result.partials.header).toEqual({ name: "Header", description: "", type: "global" });
  });

  it("surfaces a failed partial lookup", async () => {
    await withTableUnavailable(schema.appPages, async () => {
      await expect(getPartialBlocks("page-1")).rejects.toThrow(/Failed to fetch partial blocks/);
    });
  });
});
