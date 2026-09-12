import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChaiBlock } from "~/types/common";
import type { ChaiRepeaterDataEntry } from "~/types/repeater-data";
import { fetchRepeaterItems } from "./fetch-repeater-items";
import { resolveRepeaterSource } from "./resolve-source";

vi.mock("./resolve-source", () => ({ resolveRepeaterSource: vi.fn() }));

const mockResolve = vi.mocked(resolveRepeaterSource);

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
  beforeEach(() => {
    mockResolve.mockReset();
  });

  it("fetches through fetchItem with a limit-1 query and returns a single-element array", async () => {
    const fetchItem = vi.fn(async (_args: any) => ({ item: { slug: "a", bio: "full detail" } }));
    mockResolve.mockReturnValue({ kind: "repeaterData", source: makeSource({ fetchItem }) });

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
    mockResolve.mockReturnValue({ kind: "repeaterData", source: makeSource({ fetchItem }) });

    const block = collectionItemBlock({ filters: [{ field: "slug", operator: "equals", value: "a" }] });
    expect(await fetchRepeaterItems(fetchArgs(block))).toEqual({ items: [] });
    expect(fetchItem).toHaveBeenCalledTimes(1);
  });

  it("skips the fetch when the block has no filters", async () => {
    const fetchItem = vi.fn(async () => ({ item: { slug: "a" } }));
    mockResolve.mockReturnValue({ kind: "repeaterData", source: makeSource({ fetchItem }) });

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toEqual({ items: [] });
    expect(fetchItem).not.toHaveBeenCalled();
  });

  it("skips the fetch when every filter value resolved to nothing", async () => {
    const fetchItem = vi.fn(async () => ({ item: { slug: "a" } }));
    mockResolve.mockReturnValue({ kind: "repeaterData", source: makeSource({ fetchItem }) });

    const block = collectionItemBlock({ filters: [{ field: "slug", operator: "equals", value: "{{missing}}" }] });
    expect(await fetchRepeaterItems(fetchArgs(block))).toEqual({ items: [] });
    expect(fetchItem).not.toHaveBeenCalled();
  });

  it("returns null for a source without fetchItem", async () => {
    const source = makeSource();
    mockResolve.mockReturnValue({ kind: "repeaterData", source });

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toBeNull();
    expect(source.fetch).not.toHaveBeenCalled();
  });

  it("returns null for a legacy collection source", async () => {
    const fetch = vi.fn(async () => ({ items: [{ slug: "a" }] }));
    mockResolve.mockReturnValue({ kind: "collection", source: { id: "agents", fetch } as any });

    expect(await fetchRepeaterItems(fetchArgs(collectionItemBlock()))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the Repeater path on the list fetch", async () => {
    const source = makeSource();
    mockResolve.mockReturnValue({ kind: "repeaterData", source });

    const block = { _id: "blk2", _type: "Repeater", repeaterItems: "{{#agents}}" } as ChaiBlock;
    const result = await fetchRepeaterItems(fetchArgs(block));

    expect(result).toEqual({ items: [{ slug: "a" }, { slug: "b" }], totalItems: 2 });
    expect(source.fetch).toHaveBeenCalledTimes(1);
  });
});
