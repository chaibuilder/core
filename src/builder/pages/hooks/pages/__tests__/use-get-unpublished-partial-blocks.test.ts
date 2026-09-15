/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useGetUnpublishedPartialBlocks } from "~/builder/pages/hooks/pages/use-get-unpublished-partial-blocks";
import { ChaiBlock } from "~/types/common";

const websitePages = [{ id: "partial-1", name: "Header", online: false, changes: {} }];

vi.mock("~/builder/pages/hooks/pages/use-project-pages", () => ({
  useWebsitePrimaryPages: () => ({ data: websitePages }),
}));

const partialBlock = { _id: "b1", _type: "PartialBlock", partialBlockId: "partial-1" } as unknown as ChaiBlock;

describe("useGetUnpublishedPartialBlocks", () => {
  beforeEach(() => {
    builderStore.set(presentBlocksAtom, []);
  });

  it("reads the latest blocks at call time, not a render-time snapshot", () => {
    const { result } = renderHook(() => useGetUnpublishedPartialBlocks());
    const getPartials = result.current;

    expect(getPartials().ids).toEqual([]);

    act(() => {
      builderStore.set(presentBlocksAtom, [partialBlock]);
    });

    // Same callback instance (captured before the store update) must see the new blocks
    expect(getPartials().ids).toEqual(["partial-1"]);
  });

  it("does not subscribe to the blocks store (no re-render on block commits)", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useGetUnpublishedPartialBlocks();
    });
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
