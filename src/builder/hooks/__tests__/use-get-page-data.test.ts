/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useGetPageData } from "~/builder/hooks/use-get-page-data";
import { ChaiBlock } from "~/types/common";

describe("useGetPageData", () => {
  beforeEach(() => {
    builderStore.set(presentBlocksAtom, []);
  });

  it("reads the latest blocks at call time, not a render-time snapshot", () => {
    const { result } = renderHook(() => useGetPageData());
    const getPageData = result.current;

    expect(getPageData().blocks).toEqual([]);

    const blocks = [{ _id: "1", _type: "Heading", content: "Hello" }] as unknown as ChaiBlock[];
    act(() => {
      builderStore.set(presentBlocksAtom, blocks);
    });

    // Same callback instance (captured before the store update) must see the new blocks
    expect(getPageData().blocks).toEqual(blocks);
  });

  it("does not subscribe to the blocks store (no re-render on block commits)", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useGetPageData();
    });
    const rendersAfterMount = renders;
    const callbackAfterMount = result.current;

    act(() => {
      builderStore.set(presentBlocksAtom, [{ _id: "1", _type: "Heading" }] as unknown as ChaiBlock[]);
      builderStore.set(presentBlocksAtom, [{ _id: "1", _type: "Heading", content: "typed" }] as unknown as ChaiBlock[]);
    });

    expect(renders).toBe(rendersAfterMount);
    expect(result.current).toBe(callbackAfterMount);
  });
});
