/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChaiBlock } from "~/types/common";

vi.mock("~/builder/hooks/history/use-blocks-store-undoable-actions", () => ({
  useBlocksStore: vi.fn(),
}));

vi.mock("~/builder/hooks/use-broadcast-channel", () => ({
  useBroadcastChannel: vi.fn(() => ({ postMessage: vi.fn() })),
}));

vi.mock("~/builder/hooks/use-builder-reset", () => ({
  useBuilderReset: vi.fn(() => vi.fn()),
}));

vi.mock("~/builder/hooks/use-check-structure", () => ({
  useCheckStructure: vi.fn(() => vi.fn()),
}));

vi.mock("~/registry", () => ({
  syncBlocksWithDefaultProps: vi.fn((blocks: ChaiBlock[]) => blocks),
}));

import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useWatchPageBlocks } from "~/builder/hooks/use-watch-page-blocks";

const blocksA: ChaiBlock[] = [{ _id: "a", _type: "Box" }];
const blocksB: ChaiBlock[] = [{ _id: "b", _type: "Box" }];

describe("useWatchPageBlocks", () => {
  let setAllBlocks: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setAllBlocks = vi.fn();
    (useBlocksStore as ReturnType<typeof vi.fn>).mockReturnValue([[], setAllBlocks]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("applies blocks once per identity, not once per render", () => {
    const { rerender } = renderHook(({ blocks }) => useWatchPageBlocks(blocks), {
      initialProps: { blocks: blocksA },
    });
    act(() => vi.runAllTimers());
    expect(setAllBlocks).toHaveBeenCalledTimes(1);
    expect(setAllBlocks).toHaveBeenCalledWith(blocksA);

    // Re-renders with the same array identity must not refire the apply.
    rerender({ blocks: blocksA });
    rerender({ blocks: blocksA });
    act(() => vi.runAllTimers());
    expect(setAllBlocks).toHaveBeenCalledTimes(1);
  });

  it("cancels a superseded pending apply when the identity changes before it fires", () => {
    const { rerender } = renderHook(({ blocks }) => useWatchPageBlocks(blocks), {
      initialProps: { blocks: blocksA },
    });
    // Identity changes before the pending timer fires: only the latest value applies.
    rerender({ blocks: blocksB });
    act(() => vi.runAllTimers());
    expect(setAllBlocks).toHaveBeenCalledTimes(1);
    expect(setAllBlocks).toHaveBeenCalledWith(blocksB);
  });

  it("does not leave a pending apply behind on unmount", () => {
    const { unmount } = renderHook(({ blocks }) => useWatchPageBlocks(blocks), {
      initialProps: { blocks: blocksA },
    });
    unmount();
    act(() => vi.runAllTimers());
    expect(setAllBlocks).not.toHaveBeenCalled();
  });
});
