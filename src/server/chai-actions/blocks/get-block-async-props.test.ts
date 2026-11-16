import { describe, expect, it, vi } from "vitest";
import { registerChaiBlock } from "~/registry";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import type { ChaiBlock } from "~/types/common";
import { GetBlockAsyncPropsAction } from "./get-block-async-props";

const OfficeLocationsMap = () => null;

const officeLocationsProvider = vi.fn(async () => ({
  locations: [{ id: "o1" }],
  $cacheTags: ["es-company-1-offices"],
}));

// A real block whose own definition carries the dataProvider.
registerChaiBlock(
  OfficeLocationsMap as any,
  {
    type: "OfficeLocationsMap",
    label: "Office locations map",
    group: "test",
    dataProvider: officeLocationsProvider,
  } as any,
);

/** Runs the action in a published request context, where tag registration *would* happen if asked. */
const executeLive = (data: Parameters<GetBlockAsyncPropsAction["execute"]>[0]) =>
  withRequestContext(() => new GetBlockAsyncPropsAction().execute(data), { draft: false });

describe("GetBlockAsyncPropsAction $cacheTags stripping", () => {
  it("strips $cacheTags from repeater results without registering tags", async () => {
    const cache = installMemoryPersistentCache();
    const fetch = vi.fn(async () => ({
      items: [{ id: 1 }],
      totalItems: 1,
      $cacheTags: ["es-company-1-listings"],
    }));
    useTestChaiConfig({
      repeaterData: [
        { id: "listings", name: "Listings", fields: [{ id: "title", label: "Title", type: "text" }], fetch },
      ],
    });

    const result = await executeLive({
      block: { _id: "b1", _type: "Repeater", repeaterItems: "{{#listings}}" } as ChaiBlock,
      pageProps: {},
      lang: "en",
    });

    expect(result).toEqual({ items: [{ id: 1 }], totalItems: 1 });
    expect(cache.wraps).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ lang: "en", draft: true, inBuilder: true }));
  });

  it("returns [] for a repeater bound to an unknown source", async () => {
    const result = await executeLive({
      block: { _id: "b1", _type: "Repeater", repeaterItems: "{{#nope}}" } as ChaiBlock,
      pageProps: {},
      lang: "en",
    });

    expect(result).toEqual([]);
  });

  it("strips $cacheTags from dataProvider results without registering tags", async () => {
    const cache = installMemoryPersistentCache();

    const result = await executeLive({
      block: { _id: "b2", _type: "OfficeLocationsMap" } as ChaiBlock,
      pageProps: {},
      lang: "en",
    });

    expect(result).toEqual({ locations: [{ id: "o1" }] });
    expect(cache.wraps).toEqual([]);
  });

  it("resolves a dataProvider supplied through config blockDataProviders", async () => {
    const cache = installMemoryPersistentCache();
    useTestChaiConfig({
      blockDataProviders: {
        ConfigProvidedBlock: async () => ({ team: ["ada"], $cacheTags: ["es-company-1-team"] }),
      },
    });

    const result = await executeLive({
      block: { _id: "b3", _type: "ConfigProvidedBlock" } as ChaiBlock,
      pageProps: {},
      lang: "en",
    });

    expect(result).toEqual({ team: ["ada"] });
    expect(cache.wraps).toEqual([]);
  });

  it("returns {} for a block with no dataProvider", async () => {
    const result = await executeLive({
      block: { _id: "b4", _type: "NoProviderBlock" } as ChaiBlock,
      pageProps: {},
      lang: "en",
    });

    expect(result).toEqual({});
  });
});
