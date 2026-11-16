import { describe, expect, it, onTestFinished, vi } from "vitest";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import { installMemoryPersistentCache, type MemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withRequestContext } from "~/tests/setup/request-context";
import type { ChaiBlock, ChaiPageProps, ChaiPageTypeEntry } from "~/types";
import type { ChaiRepeaterDataEntry } from "~/types/repeater-data";
import { fetchConfigGlobalData } from "~/server/defaults/config-registry";
import { getDataByCollections, getDataByPageType, getPageData, getSiteGlobalData } from "./get-page-data";

const repeaterBlock = (id: string, sourceId: string, props: Record<string, unknown> = {}): ChaiBlock =>
  ({ _id: id, _type: "Repeater", repeaterItems: `{{#${sourceId}}}`, ...props }) as ChaiBlock;

const pageProps = { slug: "/blog/hello", pageId: "page-1" } as ChaiPageProps;

const collection = (id: string, fetch: ChaiRepeaterDataEntry["fetch"]): ChaiRepeaterDataEntry => ({
  id,
  name: id,
  fields: [
    { id: "slug", label: "Slug", type: "text" },
    { id: "title", label: "Title", type: "text" },
    { id: "site", label: "Site", type: "text" },
  ],
  fetch,
});

const pageType = (key: string, dataProvider?: ChaiPageTypeEntry["dataProvider"]): ChaiPageTypeEntry => ({
  key,
  name: key,
  ...(dataProvider ? { dataProvider } : {}),
});

/** Real config: a "blog" page type with a data provider, a global data provider, plus extras. */
function configure(input: { pageTypes?: ChaiPageTypeEntry[]; chaiCollections?: ChaiRepeaterDataEntry[] } = {}) {
  useTestChaiConfig({
    globalDataProvider: async () => ({ siteName: "Acme" }),
    pageTypes: [pageType("blog", async () => ({ post: { title: "Hello" } })), ...(input.pageTypes ?? [])],
    chaiCollections: input.chaiCollections ?? [],
  });
}

/** Published request (draftMode false) so render tags are registered through the framework cache. */
const published = <T>(fn: () => Promise<T>) => withRequestContext(fn, { draft: false });

// registerCacheTags funnels every tag registration into adapter.persistentCache
// with keyParts ["chai-render-tags", ...tags]; collect those to observe tags.
const registeredTags = (cache: MemoryPersistentCache) =>
  cache.wraps.filter((wrap) => wrap.keyParts[0] === "chai-render-tags").map((wrap) => wrap.tags);

describe("getPageData", () => {
  it("exposes pageProps alongside page type and global data for bindings", async () => {
    configure();
    installMemoryPersistentCache();

    const data = await published(() => getPageData({ blocks: [], pageProps, pageType: "blog", lang: "en" }));

    expect(data).toMatchObject({
      post: { title: "Hello" },
      global: { siteName: "Acme" },
      pageProps: { slug: "/blog/hello", pageId: "page-1" },
    });
  });

  it("passes pageProps into the binding data used to resolve repeater filters", async () => {
    const fetch = vi.fn(async () => ({ items: [{ id: 1 }], totalItems: 1 }));
    configure({ chaiCollections: [collection("posts", fetch)] });
    installMemoryPersistentCache();
    const block = repeaterBlock("b1", "posts", {
      filters: [
        { field: "slug", operator: "equals", value: "{{pageProps.slug}}" },
        { field: "title", operator: "equals", value: "{{post.title}}" },
        { field: "site", operator: "equals", value: "{{global.siteName}}" },
      ],
    });

    const data = await published(() => getPageData({ blocks: [block], pageProps, pageType: "blog", lang: "en" }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as any)[0].query.filters).toEqual([
      { field: "slug", operator: "equals", value: "/blog/hello" },
      { field: "title", operator: "equals", value: "Hello" },
      { field: "site", operator: "equals", value: "Acme" },
    ]);
    expect(data).toMatchObject({ "#posts/b1": [{ id: 1 }], "#posts/b1/totalItems": 1 });
  });
});

describe("getDataByCollections cache tags", () => {
  it("registers the auto source tag and provider $cacheTags, keeping them out of pageData", async () => {
    configure({
      chaiCollections: [
        collection("listings", async () => ({
          items: [{ id: 1 }],
          totalItems: 5,
          $cacheTags: ["es-company-1-listings", "es-company-1-listings-1"],
        })),
      ],
    });
    const cache = installMemoryPersistentCache();

    const result = await published(() =>
      getDataByCollections({ blocks: [repeaterBlock("block-1", "listings")], pageProps, lang: "en" }),
    );

    expect(result).toEqual({
      "#listings/block-1": [{ id: 1 }],
      "#listings/block-1/totalItems": 5,
    });
    expect(registeredTags(cache)).toEqual([
      [`repeater-data-${TEST_APP_ID}-listings`],
      ["es-company-1-listings", "es-company-1-listings-1"],
    ]);
  });

  it("still registers the auto source tag when the fetch fails", async () => {
    configure({
      chaiCollections: [
        collection("listings", async () => {
          throw new Error("source down");
        }),
      ],
    });
    const cache = installMemoryPersistentCache();

    const result = await published(() =>
      getDataByCollections({ blocks: [repeaterBlock("block-1", "listings")], pageProps, lang: "en" }),
    );

    expect(result).toEqual({
      "#listings/block-1": [],
      "#listings/block-1/totalItems": -1,
    });
    expect(registeredTags(cache)).toEqual([[`repeater-data-${TEST_APP_ID}-listings`]]);
  });

  it("registers only the auto source tag when the provider returns no $cacheTags", async () => {
    configure({ chaiCollections: [collection("offices", async () => ({ items: [], totalItems: 0 }))] });
    const cache = installMemoryPersistentCache();

    const result = await published(() =>
      getDataByCollections({ blocks: [repeaterBlock("block-1", "offices")], pageProps, lang: "en" }),
    );

    expect(result).toEqual({
      "#offices/block-1": [],
      "#offices/block-1/totalItems": 0,
    });
    expect(registeredTags(cache)).toEqual([[`repeater-data-${TEST_APP_ID}-offices`]]);
  });

  it("does nothing for pages without collection repeaters", async () => {
    const fetch = vi.fn(async () => ({ items: [] }));
    configure({ chaiCollections: [collection("offices", fetch)] });
    const cache = installMemoryPersistentCache();

    const result = await published(() =>
      getDataByCollections({ blocks: [{ _id: "x", _type: "Box" } as ChaiBlock], pageProps, lang: "en" }),
    );

    expect(result).toEqual({});
    expect(cache.wraps).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("getDataByPageType cache tags", () => {
  it("registers page-type-data tags and provider $cacheTags, stripping them from page data", async () => {
    configure({
      pageTypes: [
        pageType("listing-details", async () => ({
          listing: { id: "listing-1" },
          $cacheTags: ["es-company-1-listings-listing-1"],
        })),
      ],
    });
    const cache = installMemoryPersistentCache();

    const result = await published(() => getDataByPageType({ pageType: "listing-details", pageProps, lang: "en" }));

    expect(result).toEqual({ listing: { id: "listing-1" } });
    expect(registeredTags(cache)).toEqual([
      ["page-type-data", `page-type-data-${TEST_APP_ID}`, `page-type-data-${TEST_APP_ID}-listing-details`],
      ["es-company-1-listings-listing-1"],
    ]);
  });

  it("registers only the page-type-data tags when the page type has no provider", async () => {
    configure();
    const cache = installMemoryPersistentCache();

    const result = await published(() => getDataByPageType({ pageType: "page", pageProps, lang: "en" }));

    expect(result).toEqual({});
    expect(registeredTags(cache)).toEqual([
      ["page-type-data", `page-type-data-${TEST_APP_ID}`, `page-type-data-${TEST_APP_ID}-page`],
    ]);
  });
});

describe("getDataByPageType $notFound", () => {
  it("404s the route when the provider reports no item behind the URL", async () => {
    const pageNotFound = vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    configure({ pageTypes: [pageType("docs", async () => ({ $notFound: true }))] });
    installMemoryPersistentCache({ pageNotFound: pageNotFound as () => never });

    await expect(published(() => getDataByPageType({ pageType: "docs", pageProps, lang: "en" }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(pageNotFound).toHaveBeenCalled();
  });

  it("registers the provider's own $cacheTags before 404ing, so publishing the item regenerates the route", async () => {
    configure({
      pageTypes: [pageType("docs", async () => ({ $notFound: true, $cacheTags: [`docs-${TEST_APP_ID}-missing`] }))],
    });
    // The memory adapter keeps the default pageNotFound, which throws.
    const cache = installMemoryPersistentCache();

    await expect(published(() => getDataByPageType({ pageType: "docs", pageProps, lang: "en" }))).rejects.toThrow(
      "Page not found",
    );
    expect(registeredTags(cache)).toEqual([
      ["page-type-data", `page-type-data-${TEST_APP_ID}`, `page-type-data-${TEST_APP_ID}-docs`],
      [`docs-${TEST_APP_ID}-missing`],
    ]);
  });

  it("keeps the envelope key out of the page data when the item exists", async () => {
    configure({ pageTypes: [pageType("docs", async () => ({ doc: { title: "Overview" }, $notFound: false }))] });
    installMemoryPersistentCache();

    const result = await published(() => getDataByPageType({ pageType: "docs", pageProps, lang: "en" }));

    expect(result).toEqual({ doc: { title: "Overview" } });
  });
});

// Site global data is cached with no expiry and nothing fires its tags, so a failure
// swallowed into `{}` here would blank every `global.*` binding until a redeploy.
describe("getSiteGlobalData provider failure", () => {
  it("rejects instead of caching {}, and retries on the next request", async () => {
    const globalDataProvider = vi
      .fn()
      .mockRejectedValueOnce(new Error("search cluster down"))
      .mockResolvedValue({ siteName: "Acme" });
    useTestChaiConfig({ globalDataProvider });
    installMemoryPersistentCache();

    await expect(published(() => getSiteGlobalData("en"))).rejects.toThrow("search cluster down");
    await expect(published(() => getSiteGlobalData("en"))).resolves.toEqual({ siteName: "Acme" });
    expect(globalDataProvider).toHaveBeenCalledTimes(2);
  });

  it("still degrades to {} in the builder, which caches nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useTestChaiConfig({
      globalDataProvider: async () => {
        throw new Error("search cluster down");
      },
    });

    await expect(fetchConfigGlobalData({ lang: "en", draft: true, inBuilder: true })).resolves.toEqual({});
  });
});

describe("getSiteGlobalData cache key", () => {
  it("refetches on the first request of a new year", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => void vi.useRealTimers());
    useTestChaiConfig({ globalDataProvider: async () => ({ year: new Date().getFullYear() }) });
    installMemoryPersistentCache();

    vi.setSystemTime(new Date("2027-12-31T12:00:00Z"));
    await expect(published(() => getSiteGlobalData("en"))).resolves.toEqual({ year: 2027 });
    vi.setSystemTime(new Date("2028-01-01T12:00:00Z"));
    await expect(published(() => getSiteGlobalData("en"))).resolves.toEqual({ year: 2028 });
  });
});
