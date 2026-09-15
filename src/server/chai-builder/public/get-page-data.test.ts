import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFrameworkAdapterForTests, setFrameworkAdapter } from "~/server/framework-adapter";
import type { ChaiBlock, ChaiPageProps } from "~/types";

const mocks = vi.hoisted(() => ({
  hasBindings: vi.fn(),
  fetchRepeaterItems: vi.fn(),
  getResolvedPageType: vi.fn(),
}));

vi.mock("~/server/chai-builder/state", () => ({
  getInitializedState: () => ({ appId: "app-1", draftMode: false }),
  getOptionalRequestState: () => undefined,
}));

vi.mock("~/server/chai-builder/public/cache-utils", () => ({
  withChaiCache: (fn: any) => fn,
  withRequestCache: (fn: any) => fn,
}));

vi.mock("~/server/defaults", () => ({
  fetchConfigGlobalData: async () => ({ siteName: "Acme" }),
  getResolvedPageType: mocks.getResolvedPageType,
}));

vi.mock("~/server/repeater-data/build-repeater-query", () => ({
  blockFiltersHaveBindings: mocks.hasBindings,
}));

vi.mock("~/server/repeater-data/fetch-repeater-items", () => ({
  fetchRepeaterItems: mocks.fetchRepeaterItems,
}));

import { getDataByCollections, getDataByPageType, getPageData } from "./get-page-data";

const repeaterBlock = (id: string, sourceId: string): ChaiBlock =>
  ({ _id: id, _type: "Repeater", repeaterItems: `{{#${sourceId}}}` }) as ChaiBlock;

const pageProps = { slug: "/blog/hello", pageId: "page-1" } as ChaiPageProps;

// registerCacheTags funnels every tag registration into adapter.persistentCache
// with keyParts ["chai-render-tags", ...tags]; collect those to observe tags.
function spyRegisteredTags() {
  const registered: string[][] = [];
  const persistentCache = vi.fn((_fn: unknown, _keyParts: string[], opts?: { tags?: string[] }) => {
    registered.push(opts?.tags ?? []);
    return vi.fn().mockResolvedValue(null);
  });
  setFrameworkAdapter({ persistentCache: persistentCache as any });
  return registered;
}

beforeEach(() => {
  mocks.hasBindings.mockReset().mockReturnValue(false);
  mocks.fetchRepeaterItems.mockReset().mockResolvedValue({ items: [{ id: 1 }], totalItems: 1 });
  mocks.getResolvedPageType
    .mockReset()
    .mockReturnValue({ dataProvider: async () => ({ post: { title: "Hello" } }) });
  resetFrameworkAdapterForTests();
});

describe("getPageData", () => {
  it("exposes pageProps alongside page type and global data for bindings", async () => {
    const data = await getPageData({ blocks: [], pageProps, pageType: "blog", lang: "en" });

    expect(data).toMatchObject({
      post: { title: "Hello" },
      global: { siteName: "Acme" },
      pageProps: { slug: "/blog/hello", pageId: "page-1" },
    });
  });

  it("passes pageProps into the binding data used to resolve repeater filters", async () => {
    mocks.hasBindings.mockReturnValue(true);
    const block = repeaterBlock("b1", "posts");

    await getPageData({ blocks: [block], pageProps, pageType: "blog", lang: "en" });

    expect(mocks.fetchRepeaterItems).toHaveBeenCalledWith(
      expect.objectContaining({
        externalData: { post: { title: "Hello" }, global: { siteName: "Acme" }, pageProps },
      }),
    );
  });
});

describe("getDataByCollections cache tags", () => {
  it("registers the auto source tag and provider $cacheTags, keeping them out of pageData", async () => {
    const registered = spyRegisteredTags();
    mocks.fetchRepeaterItems.mockResolvedValue({
      items: [{ id: 1 }],
      totalItems: 5,
      $cacheTags: ["es-company-1-listings", "es-company-1-listings-1"],
    });

    const result = await getDataByCollections({ blocks: [repeaterBlock("block-1", "listings")], pageProps, lang: "en" });

    expect(result).toEqual({
      "#listings/block-1": [{ id: 1 }],
      "#listings/block-1/totalItems": 5,
    });
    expect(registered).toEqual([
      ["repeater-data-app-1-listings"],
      ["es-company-1-listings", "es-company-1-listings-1"],
    ]);
  });

  it("still registers the auto source tag when the fetch fails", async () => {
    const registered = spyRegisteredTags();
    mocks.fetchRepeaterItems.mockRejectedValue(new Error("source down"));

    const result = await getDataByCollections({ blocks: [repeaterBlock("block-1", "listings")], pageProps, lang: "en" });

    expect(result).toEqual({
      "#listings/block-1": [],
      "#listings/block-1/totalItems": -1,
    });
    expect(registered).toEqual([["repeater-data-app-1-listings"]]);
  });

  it("registers only the auto source tag when the provider returns no $cacheTags", async () => {
    const registered = spyRegisteredTags();
    mocks.fetchRepeaterItems.mockResolvedValue({ items: [], totalItems: 0 });

    const result = await getDataByCollections({ blocks: [repeaterBlock("block-1", "offices")], pageProps, lang: "en" });

    expect(result).toEqual({
      "#offices/block-1": [],
      "#offices/block-1/totalItems": 0,
    });
    expect(registered).toEqual([["repeater-data-app-1-offices"]]);
  });

  it("does nothing for pages without collection repeaters", async () => {
    const registered = spyRegisteredTags();
    const result = await getDataByCollections({
      blocks: [{ _id: "x", _type: "Box" } as ChaiBlock],
      pageProps,
      lang: "en",
    });
    expect(result).toEqual({});
    expect(registered).toEqual([]);
    expect(mocks.fetchRepeaterItems).not.toHaveBeenCalled();
  });
});

describe("getDataByPageType cache tags", () => {
  it("registers page-type-data tags and provider $cacheTags, stripping them from page data", async () => {
    const registered = spyRegisteredTags();
    mocks.getResolvedPageType.mockReturnValue({
      dataProvider: vi.fn(async () => ({
        listing: { id: "listing-1" },
        $cacheTags: ["es-company-1-listings-listing-1"],
      })),
    });

    const result = await getDataByPageType({ pageType: "listing-details", pageProps, lang: "en" });

    expect(result).toEqual({ listing: { id: "listing-1" } });
    expect(registered).toEqual([
      ["page-type-data", "page-type-data-app-1", "page-type-data-app-1-listing-details"],
      ["es-company-1-listings-listing-1"],
    ]);
  });

  it("registers only the page-type-data tags when the page type has no provider", async () => {
    const registered = spyRegisteredTags();
    mocks.getResolvedPageType.mockReturnValue({});

    const result = await getDataByPageType({ pageType: "page", pageProps, lang: "en" });

    expect(result).toEqual({});
    expect(registered).toEqual([["page-type-data", "page-type-data-app-1", "page-type-data-app-1-page"]]);
  });
});

describe("getDataByPageType $notFound", () => {
  it("404s the route when the provider reports no item behind the URL", async () => {
    const pageNotFound = vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    setFrameworkAdapter({ pageNotFound: pageNotFound as any });
    mocks.getResolvedPageType.mockReturnValue({ dataProvider: vi.fn(async () => ({ $notFound: true })) });

    await expect(getDataByPageType({ pageType: "docs", pageProps, lang: "en" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(pageNotFound).toHaveBeenCalled();
  });

  it("registers the provider's own $cacheTags before 404ing, so publishing the item regenerates the route", async () => {
    // setFrameworkAdapter merges over the noop adapter, not over the previous
    // one, so the tag spy and pageNotFound must be installed together; the noop
    // pageNotFound already throws, which is all this test needs.
    const registered = spyRegisteredTags();
    mocks.getResolvedPageType.mockReturnValue({
      dataProvider: vi.fn(async () => ({ $notFound: true, $cacheTags: ["docs-app-1-missing"] })),
    });

    await expect(getDataByPageType({ pageType: "docs", pageProps, lang: "en" })).rejects.toThrow("Page not found");
    expect(registered).toEqual([
      ["page-type-data", "page-type-data-app-1", "page-type-data-app-1-docs"],
      ["docs-app-1-missing"],
    ]);
  });

  it("keeps the envelope key out of the page data when the item exists", async () => {
    spyRegisteredTags();
    mocks.getResolvedPageType.mockReturnValue({
      dataProvider: vi.fn(async () => ({ doc: { title: "Overview" }, $notFound: false })),
    });

    const result = await getDataByPageType({ pageType: "docs", pageProps, lang: "en" });

    expect(result).toEqual({ doc: { title: "Overview" } });
  });
});
