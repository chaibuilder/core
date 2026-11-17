import { describe, expect, it, vi } from "vitest";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import type { ChaiCollectionEntry } from "~/types/deprecated";
import type { ChaiBlock } from "~/types/common";
import type { ChaiRepeaterDataEntry } from "~/types/repeater-data";
import { fetchRepeaterItems } from "./fetch-repeater-items";

/** Registers the source in the real config, the way a host app passes `chaiCollections`. */
const useRepeaterSource = (source: ChaiRepeaterDataEntry) => useTestChaiConfig({ chaiCollections: [source] });

const makeSource = (overrides: Partial<ChaiRepeaterDataEntry> = {}): ChaiRepeaterDataEntry => ({
  id: "agents",
  name: "Agents",
  fields: [{ id: "slug", label: "Slug", type: "text" }],
  fetch: vi.fn(async () => ({ items: [{ slug: "a" }, { slug: "b" }], totalItems: 2 })),
  ...overrides,
});

const fetchArgs = (block: ChaiBlock) => ({
  block,
  pageProps: { slug: "/agents/ann" },
  lang: "en",
  draft: false,
  inBuilder: false,
});

const collectionItemBlock = (props: Record<string, unknown> = {}): ChaiBlock =>
  ({ _id: "blk1", _type: "CollectionItem", repeaterItems: "{{#agents}}", ...props }) as ChaiBlock;

describe("fetchRepeaterItems for CollectionItem", () => {
  it("fetches through fetchItem with a limit-1 query and returns a single-element array", async () => {
    const fetchItem = vi.fn(async (_args: any) => ({ item: { slug: "a", bio: "full detail" } }));
    useRepeaterSource(makeSource({ fetchItem }));

    const result = await fetchRepeaterItems(
      fetchArgs(collectionItemBlock({ filters: [{ field: "slug", operator: "equals", value: "a" }] })),
    );

    expect(result).toEqual({ items: [{ slug: "a", bio: "full detail" }] });
    expect(fetchItem).toHaveBeenCalledTimes(1);
    const { query } = fetchItem.mock.calls[0][0] as any;
    expect(query.limit).toBe(1);
    expect(query.filters).toEqual([{ field: "slug", operator: "equals", value: "a" }]);
  });

  it("returns empty items when fetchItem finds nothing", async () => {
    const fetchItem = vi.fn(async () => ({ item: null }));
    useRepeaterSource(makeSource({ fetchItem }));

    const block = collectionItemBlock({ filters: [{ field: "slug", operator: "equals", value: "a" }] });
    expect(await fetchRepeaterItems(fetchArgs(block))).toEqual({ items: [] });
    expect(fetchItem).toHaveBeenCalledTimes(1);
  });

  it("skips the fetch when the block has no filters", async () => {
    const fetchItem = vi.fn(async () => ({ item: { slug: "a" } }));
    useRepeaterSource(makeSource({ fetchItem }));

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toEqual({ items: [] });
    expect(fetchItem).not.toHaveBeenCalled();
  });

  it("skips the fetch when every filter value resolved to nothing", async () => {
    const fetchItem = vi.fn(async () => ({ item: { slug: "a" } }));
    useRepeaterSource(makeSource({ fetchItem }));

    const block = collectionItemBlock({ filters: [{ field: "slug", operator: "equals", value: "{{missing}}" }] });
    expect(await fetchRepeaterItems(fetchArgs(block))).toEqual({ items: [] });
    expect(fetchItem).not.toHaveBeenCalled();
  });

  it("returns null for a source without fetchItem", async () => {
    const source = makeSource();
    useRepeaterSource(source);

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toBeNull();
    expect(source.fetch).not.toHaveBeenCalled();
  });

  it("returns null for a legacy collection source", async () => {
    const fetch = vi.fn(async () => ({ items: [{ slug: "a" }] }));
    useTestChaiConfig({ collections: [{ id: "agents", name: "Agents", fetch } as unknown as ChaiCollectionEntry] });

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the Repeater path on the list fetch", async () => {
    const source = makeSource();
    useRepeaterSource(source);

    const block = { _id: "blk2", _type: "Repeater", repeaterItems: "{{#agents}}" } as ChaiBlock;
    const result = await fetchRepeaterItems(fetchArgs(block));

    expect(result).toEqual({ items: [{ slug: "a" }, { slug: "b" }], totalItems: 2 });
    expect(source.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchRepeaterItems source lookup", () => {
  it("returns null for a source id that is not configured", async () => {
    useTestChaiConfig();
    const block = { _id: "blk3", _type: "Repeater", repeaterItems: "{{#unknown}}" } as ChaiBlock;
    expect(await fetchRepeaterItems(fetchArgs(block))).toBeNull();
  });
});
