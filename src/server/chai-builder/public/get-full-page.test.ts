import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { fake } from "~/tests/setup/fakers";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { ChaiBlock } from "~/types";
import { getFullPage } from "./get-full-page";

const block = (props: Partial<ChaiBlock> & { _id: string }): ChaiBlock => ({ _type: "Box", ...props }) as ChaiBlock;
const partialRef = (id: string, target: string): ChaiBlock =>
  ({ _id: id, _type: "PartialBlock", partialBlockId: target }) as ChaiBlock;

/** Draft rows: page-1 references partials A and B; `partialBlocks` is the denormalized column. */
async function seedPage(partialBlocks: string | null) {
  await withTestDB(async ({ seedMany }) => {
    await seedMany("appPages", [
      {
        id: "page-1",
        name: "Page",
        slug: "/page",
        lang: "en",
        pageType: "page",
        lastSaved: "now",
        partialBlocks,
        blocks: [partialRef("p1", "A"), partialRef("p2", "B")],
      },
      { id: "A", name: "A", slug: "/a", pageType: "global", blocks: [block({ _id: "a1", content: "from A" } as any)] },
      { id: "B", name: "B", slug: "/b", pageType: "global", blocks: [block({ _id: "b1", content: "from B" } as any)] },
    ]);
  });
}

const inDraftContext = <T>(fn: () => Promise<T>): Promise<T> =>
  withTestDB(async ({ inRequest }) => inRequest(fn, { draft: true }));

const contents = (blocks: ChaiBlock[]) => blocks.map((b) => (b as any).content).filter(Boolean);

describe("getFullPage partialIds", () => {
  it("returns the sorted partial ids from a complete partialBlocks column", async () => {
    await seedPage("B|A");

    const result = await inDraftContext(() => getFullPage("page-1"));

    expect(result.partialIds).toEqual(["A", "B"]);
    expect(result).toMatchObject({ id: "page-1", name: "Page", slug: "/page", lang: "en", pageType: "page" });
    expect(contents(result.blocks)).toEqual(["from A", "from B"]);
    expect(result.blocks.some((b: ChaiBlock) => b._type === "PartialBlock")).toBe(false);
  });

  it("includes partials the stale column missed but the block scan found", async () => {
    // Column only knows A; the page blocks also reference B, which the top-up scan must fetch.
    await seedPage("A");

    const result = await inDraftContext(() => getFullPage("page-1"));

    expect(result.partialIds).toEqual(["A", "B"]);
    expect(contents(result.blocks)).toEqual(["from A", "from B"]);
  });

  it("returns empty partialIds when partial merging is disabled", async () => {
    await seedPage("A");

    const result = await inDraftContext(() => getFullPage("page-1", { mergePartials: false }));

    expect(result.partialIds).toEqual([]);
    expect(result.blocks.some((b: ChaiBlock) => b._type === "PartialBlock")).toBe(true);
    expect(contents(result.blocks)).toEqual([]);
  });
});

describe("getFullPage query failure", () => {
  it("throws the query error with its cause instead of PAGE_NOT_FOUND", async () => {
    await seedPage("A|B");

    const error = await withTableUnavailable(schema.appPages, () =>
      inDraftContext(() => getFullPage("page-1")).catch((e: unknown) => e),
    );

    expect((error as Error).message).toBe("FAILED_TO_FETCH_PAGE");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("still reports PAGE_NOT_FOUND for an id with no row", async () => {
    await expect(inDraftContext(() => getFullPage("missing-page"))).rejects.toThrow("PAGE_NOT_FOUND");
  });

  it("carries the query error as the cause when the blocks fetch fails", async () => {
    // Pre-provided partialBlocks skips the page-row query, so the blocks query is the one that fails.
    const error = await withTableUnavailable(schema.appPages, () =>
      inDraftContext(() => getFullPage("page-1", { partialBlocks: "" })).catch((e: unknown) => e),
    );

    expect((error as Error).message).toBe("FAILED_TO_FETCH_PAGE_BLOCKS");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("does not persist the failure: the published page loads once the table is back", async () => {
    await withTestDB(({ seed }) =>
      seed("appPagesOnline", fake.appPagesOnline({ id: "page-1", slug: "/page", blocks: [block({ _id: "b1" })] })),
    );
    installMemoryPersistentCache();
    const load = () => withRequestContext(() => getFullPage("page-1"), { draft: false });

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(load()).rejects.toThrow("FAILED_TO_FETCH_PAGE");
    });

    await expect(load()).resolves.toMatchObject({ id: "page-1", slug: "/page" });
  });
});
