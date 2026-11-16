import { describe, expect, it, vi } from "vitest";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { GetBuilderPageDataAction } from "./get-builder-page-data";

describe("GetBuilderPageDataAction $cacheTags stripping", () => {
  it("strips $cacheTags from the provider result without registering tags", async () => {
    const cache = installMemoryPersistentCache();
    const dataProvider = vi.fn(async () => ({
      listing: { id: "listing-1" },
      $cacheTags: ["es-company-1-listings-listing-1"],
    }));
    useTestChaiConfig({ pageTypes: [{ key: "listing-details", name: "Listing details", dataProvider }] });

    // Published request context: tags *would* register here if the builder path asked for it.
    const result = await withRequestContext(
      () =>
        new GetBuilderPageDataAction().execute({
          lang: "en",
          pageType: "listing-details",
          pageProps: { slug: "/listing-1" },
        }),
      { draft: false },
    );

    expect(result).toEqual({ listing: { id: "listing-1" } });
    expect(cache.wraps).toEqual([]);
    expect(dataProvider).toHaveBeenCalledWith({
      lang: "en",
      draft: true,
      inBuilder: true,
      pageProps: { slug: "/listing-1" },
    });
  });

  it("returns an empty object when the page type has no provider", async () => {
    useTestChaiConfig({ pageTypes: [{ key: "plain", name: "Plain" }] });

    const result = await new GetBuilderPageDataAction().execute({ lang: "en", pageType: "plain", pageProps: {} });

    expect(result).toEqual({});
  });

  it("returns an empty object for an unknown page type", async () => {
    const result = await new GetBuilderPageDataAction().execute({ lang: "en", pageType: "missing", pageProps: {} });

    expect(result).toEqual({});
  });
});
