import { describe, expect, it } from "vitest";
import { registerChaiBlock } from "~/registry";
import { registerChaiPipe } from "~/registry/pipes";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import {
  buildCustomBlockCatalog,
  customBlockHtmlTag,
  getCustomCatalogBlocks,
  isCatalogProp,
  buildDataBindingPathsText,
  buildDataBindingPipesText,
  buildPageTypeContext,
} from "./ai-edit-page-prompt-context";

// Real registry entries: one custom block restricted to the "product" page type, one unrestricted.
const NullComponent = (() => null) as any;
registerChaiBlock(NullComponent, {
  type: "Gallery",
  label: "Gallery",
  group: "test",
  description: "Shows a media gallery",
  pageTypes: ["product"],
} as any);
registerChaiBlock(NullComponent, {
  type: "Hero",
  label: "Hero",
  group: "test",
  description: "Shows a hero section",
} as any);

describe("buildCustomBlockCatalog", () => {
  it("excludes blocks restricted to a different page type", () => {
    const catalog = buildCustomBlockCatalog("page");
    expect(catalog).toContain("### Hero");
    expect(catalog).not.toContain("### Gallery");
  });

  it("includes blocks restricted to the current page type", () => {
    const catalog = buildCustomBlockCatalog("product");
    expect(catalog).toContain("### Hero");
    expect(catalog).toContain("### Gallery");
  });

  it("treats an unset page type as the default 'page' type", () => {
    const catalog = buildCustomBlockCatalog(undefined);
    expect(catalog).toContain("### Hero");
    expect(catalog).not.toContain("### Gallery");
  });

  it("omits blocks listed in hiddenBlockTypes", () => {
    const catalog = buildCustomBlockCatalog("product", ["Gallery"]);
    expect(catalog).toContain("### Hero");
    expect(catalog).not.toContain("### Gallery");
  });

  it("ignores non-array hiddenBlockTypes input", () => {
    const catalog = buildCustomBlockCatalog("product", "Gallery");
    expect(catalog).toContain("### Hero");
    expect(catalog).toContain("### Gallery");
  });

  it("annotates multi-block groups so the AI picks ONE when entries are layout variants", () => {
    registerChaiBlock(NullComponent, {
      type: "FeaturedAltOne",
      label: "Featured Alt One",
      group: "featured-alt",
      description: "First featured layout",
    } as any);
    registerChaiBlock(NullComponent, {
      type: "FeaturedAltTwo",
      label: "Featured Alt Two",
      group: "featured-alt",
      description: "Second featured layout",
    } as any);

    const catalog = buildCustomBlockCatalog("page");
    expect(catalog).toContain(
      "## Group: featured-alt (2 blocks — pick ONE if these are layout variants of the same section)",
    );
  });
});

describe("custom catalog helpers", () => {
  it("lists the same blocks as the catalog, per page type", () => {
    const types = (pageType: string, hidden?: string[]) =>
      getCustomCatalogBlocks(pageType, hidden).map(([key, block]) => block.type ?? key);
    expect(types("page")).toContain("Hero");
    expect(types("page")).not.toContain("Gallery");
    expect(types("product")).toContain("Gallery");
    expect(types("product", ["Gallery"])).not.toContain("Gallery");
    expect(types("product", ["Gallery"])).toContain("Hero");
    expect(types("page")).not.toContain("Box");
  });

  it("derives the AI-HTML tag and skips builder-managed props", () => {
    expect(customBlockHtmlTag("SearchHomePage")).toBe("chai-search-home-page");
    expect(isCatalogProp({ type: "string" })).toBe(true);
    expect(isCatalogProp({ type: "string", styles: true })).toBe(false);
    expect(isCatalogProp({ type: "null", runtime: true })).toBe(false);
    expect(isCatalogProp({ type: "string", hidden: true })).toBe(false);
  });
});

describe("buildDataBindingPipesText", () => {
  it("advertises registered pipe types and arguments", () => {
    const catalog = buildDataBindingPipesText();
    expect(catalog).toContain("Plain bindings need no formatter: {{path}}");
    expect(catalog).toContain("Never add default automatically");
    expect(catalog).toContain("accepted input type matches the binding path type");
    expect(catalog).toContain("Value formatters (regular block properties only)");
    expect(catalog).toContain("uppercase [string → string]");
    expect(catalog).toContain("currency:string (required, default 'USD')");
    expect(catalog).toContain("Example: {{path | currency 'USD'}}");
    expect(catalog).toContain("Example: {{path | date 'medium'}}");
    expect(catalog).toContain("Fallback formatter (opt-in only)");
    expect(catalog).toContain("USE ONLY when user explicitly requests a fallback value");
    expect(catalog).toContain("Boolean formatters (conditional visibility / _show only)");
    expect(catalog).toContain("gt [number|string → boolean]");
    expect(catalog).toContain("Example: {{path | gt 0}}");
  });

  it("includes application-registered formatters", () => {
    registerChaiPipe({
      name: "testAiSuffix",
      label: "AI test suffix",
      accepts: ["string"],
      returns: "string",
      args: [{ name: "suffix", type: "string", required: true, default: "!" }],
      transform: ({ value, args }) => `${value}${args[0]}`,
    });

    expect(buildDataBindingPipesText()).toContain("Example: {{path | testAiSuffix '!'}}");
  });
});

describe("buildPageTypeContext", () => {
  it("describes a configured page type with its description", () => {
    useTestChaiConfig({ pageTypes: [{ key: "product", name: "Product", description: "A product page" }] });
    expect(buildPageTypeContext("product")).toBe("Page type: product\nA product page");
  });

  it("names an unknown page type and handles a missing one", () => {
    expect(buildPageTypeContext("unknown")).toBe("Page type: unknown");
    expect(buildPageTypeContext(undefined)).toBe("Standard page (no specific page type).");
  });
});

describe("buildDataBindingPathsText", () => {
  it("falls back when no paths are available", () => {
    expect(buildDataBindingPathsText(undefined)).toBe("No data binding paths available for this page.");
  });

  it("lists array item fields as $index paths", () => {
    const text = buildDataBindingPathsText({
      global: ["global.title"],
      page: ["posts"],
      arrays: [
        {
          path: "posts",
          scope: "page",
          itemType: "object",
          itemFields: [
            { name: "title", type: "string" },
            { name: "author.name", type: "string" },
          ],
        },
      ],
    });
    expect(text).toContain("- (page) {{posts}} — array of objects. Item fields:");
    expect(text).toContain("{{$index.title}} (string)");
    expect(text).toContain("{{$index.author.name}} (string)");
    expect(text).toContain('repeater-items="{{arrayPath}}"');
  });

  it("describes primitive and empty arrays", () => {
    const text = buildDataBindingPathsText({
      global: [],
      page: [],
      arrays: [
        { path: "tags", scope: "page", itemType: "string", itemFields: [] },
        { path: "global.banners", scope: "global", itemType: "unknown", itemFields: [] },
      ],
    });
    expect(text).toContain("- (page) {{tags}} — array of string values. Use {{$index}} for each item.");
    expect(text).toContain("- (global) {{global.banners}} — array, empty right now");
  });

  it("omits the arrays section when there are none", () => {
    const text = buildDataBindingPathsText({ global: ["global.title"], page: [], arrays: [] });
    expect(text).toBe("- (global) {{global.title}}");
  });

  it("includes path types so AI can choose compatible formatters", () => {
    const text = buildDataBindingPathsText({
      global: ["global.company.name"],
      page: ["listing.price"],
      pathTypes: { "global.company.name": "string", "listing.price": "number" },
    });
    expect(text).toContain("{{global.company.name}} (string)");
    expect(text).toContain("{{listing.price}} (number)");
  });
});
