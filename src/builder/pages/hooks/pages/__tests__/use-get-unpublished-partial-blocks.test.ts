/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useGetUnpublishedPartialBlocks, withNestedPartials } from "~/builder/pages/hooks/pages/use-get-unpublished-partial-blocks";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { ChaiBlock } from "~/types/common";

const websitePages = [{ id: "partial-1", name: "Header", online: false, changes: {} }];

const partialBlock = { _id: "b1", _type: "PartialBlock", partialBlockId: "partial-1" } as unknown as ChaiBlock;

describe("useGetUnpublishedPartialBlocks", () => {
  beforeEach(() => {
    mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, websitePages);
  });

  it("reads the latest blocks at call time, not a render-time snapshot", async () => {
    const { result } = renderHookInBuilder(() => useGetUnpublishedPartialBlocks(), { blocks: [] });
    // Wait for the real GET_WEBSITE_PAGES query to land: the callback identity changes once.
    const initial = result.current;
    await waitFor(() => expect(result.current).not.toBe(initial));
    const getPartials = result.current;

    expect(getPartials().ids).toEqual([]);

    act(() => {
      builderStore.set(presentBlocksAtom, [partialBlock]);
    });

    // Same callback instance (captured before the store update) must see the new blocks
    expect(getPartials().ids).toEqual(["partial-1"]);
  });

  it("does not subscribe to the blocks store (no re-render on block commits)", async () => {
    let renders = 0;
    const { result } = renderHookInBuilder(
      () => {
        renders++;
        return useGetUnpublishedPartialBlocks();
      },
      { blocks: [] },
    );
    const initial = result.current;
    await waitFor(() => expect(result.current).not.toBe(initial));
    const rendersAfterMount = renders;
    const callbackAfterMount = result.current;

    act(() => {
      builderStore.set(presentBlocksAtom, [partialBlock]);
      builderStore.set(presentBlocksAtom, [partialBlock, { ...partialBlock, _id: "b2" }] as ChaiBlock[]);
    });

    expect(renders).toBe(rendersAfterMount);
    expect(result.current).toBe(callbackAfterMount);
  });
});

describe("withNestedPartials", () => {
  const pages = [
    { id: "header", partialBlocks: "logo|menu" },
    { id: "logo", partialBlocks: "icon" },
    { id: "icon", partialBlocks: "header" },
    { id: "menu", partialBlocks: null },
  ];

  it("adds every global block the given ones nest, and ends a cycle", () => {
    expect(withNestedPartials(["header"], pages)).toEqual(["header", "logo", "menu", "icon"]);
  });

  it("keeps an id it cannot find, and nests nothing under it", () => {
    expect(withNestedPartials(["gone"], pages)).toEqual(["gone"]);
  });
});
