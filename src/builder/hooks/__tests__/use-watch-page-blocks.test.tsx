/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { useBlockSelectionQuerySync } from "~/builder/hooks/use-block-selection-query-sync";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { useWatchPageBlocks } from "~/builder/hooks/use-watch-page-blocks";
import { registerChaiBlockProps } from "~/registry";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { ChaiBlock } from "~/types/common";

// A real registration with a schema default, so the apply goes through the real syncBlocksWithDefaultProps.
registerTestBlocks({
  type: "WatchBox",
  props: registerChaiBlockProps({ properties: { title: { type: "string", default: "Default title" } } }),
} as any);

const blocksA: ChaiBlock[] = [{ _id: "a", _type: "WatchBox" }];
const blocksB: ChaiBlock[] = [{ _id: "b", _type: "WatchBox" }];

type Store = ReturnType<typeof renderHookInBuilder>["store"];

/** Counts real writes that change the page blocks in the store. */
const countBlockApplies = (store: Store) => {
  const counter = { count: 0, unsubscribe: () => {} };
  counter.unsubscribe = store.sub(presentBlocksAtom, () => {
    counter.count++;
  });
  return counter;
};

const renderWatch = (blocks: ChaiBlock[]) =>
  renderHookInBuilder(({ blocks }: { blocks: ChaiBlock[] }) => useWatchPageBlocks(blocks), {
    initialProps: { blocks },
  });

describe("useWatchPageBlocks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies blocks once per identity, not once per render", () => {
    const { rerender, store } = renderWatch(blocksA);
    const applies = countBlockApplies(store);
    act(() => vi.runAllTimers());
    expect(applies.count).toBe(1);
    expect(store.get(presentBlocksAtom)).toEqual([{ _id: "a", _type: "WatchBox", title: "Default title" }]);
    expect(store.get(isPageLoadedAtom)).toBe(true);

    // State changed after the apply: a refire would reset the selection and re-apply blocks.
    act(() => store.set(selectedBlockIdsAtom, ["a"]));

    // Re-renders with the same array identity must not refire the apply.
    rerender({ blocks: blocksA });
    rerender({ blocks: blocksA });
    act(() => vi.runAllTimers());
    expect(applies.count).toBe(1);
    expect(store.get(selectedBlockIdsAtom)).toEqual(["a"]);
    applies.unsubscribe();
  });

  it("cancels a superseded pending apply when the identity changes before it fires", () => {
    const { rerender, store } = renderWatch(blocksA);
    const applies = countBlockApplies(store);
    // Identity changes before the pending timer fires: only the latest value applies.
    rerender({ blocks: blocksB });
    act(() => vi.runAllTimers());
    expect(applies.count).toBe(1);
    expect(store.get(presentBlocksAtom)).toEqual([{ _id: "b", _type: "WatchBox", title: "Default title" }]);
    applies.unsubscribe();
  });

  it("does not leave a pending apply behind on unmount", () => {
    const { unmount, store } = renderWatch(blocksA);
    const applies = countBlockApplies(store);
    expect(store.get(isPageLoadedAtom)).toBe(false);
    unmount();
    act(() => vi.runAllTimers());
    expect(applies.count).toBe(0);
    expect(store.get(presentBlocksAtom)).toEqual([]);
    expect(store.get(isPageLoadedAtom)).toBe(false);
    applies.unsubscribe();
  });
});

/**
 * Boot hop: applying page blocks flips `isPageLoaded` false->true across a real React commit, so
 * `useBlockSelectionQuerySync` resets its one-shot restore guard and re-preselects `?bid=` on an SPA
 * page switch (no remount). Real timers, so the actual scheduling order (state-render before the
 * setTimeout(0) apply) is exercised.
 */
describe("useWatchPageBlocks + useBlockSelectionQuerySync (boot hop)", () => {
  const setUrlBid = (bid: string) => window.history.replaceState({}, "", `/?bid=${bid}`);

  const useBoot = ({ blocks }: { blocks: ChaiBlock[] }) => {
    useWatchPageBlocks(blocks);
    useBlockSelectionQuerySync();
  };

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("restores ?bid selection on initial boot", async () => {
    setUrlBid("B1");
    const { store } = renderHookInBuilder(useBoot, {
      initialProps: { blocks: [{ _id: "B1", _type: "WatchBox" }] as ChaiBlock[] },
    });
    await waitFor(() => expect(store.get(selectedBlockIdsAtom)).toEqual(["B1"]));
  });

  it("re-restores ?bid after an SPA page switch (guard reset on the false->true edge)", async () => {
    setUrlBid("B1");
    const { rerender, store } = renderHookInBuilder(useBoot, {
      initialProps: { blocks: [{ _id: "B1", _type: "WatchBox" }] as ChaiBlock[] },
    });
    await waitFor(() => expect(store.get(selectedBlockIdsAtom)).toEqual(["B1"]));

    // SPA switch: new page (new blocks identity), new bid in URL, no remount.
    setUrlBid("B2");
    rerender({ blocks: [{ _id: "B2", _type: "WatchBox" }] as ChaiBlock[] });
    await waitFor(() => expect(store.get(selectedBlockIdsAtom)).toEqual(["B2"]));
    expect(store.get(presentBlocksAtom).map((b: ChaiBlock) => b._id)).toEqual(["B2"]);
  });

  it("broadcasts the applied blocks to other tabs for the current page", async () => {
    const otherTab = new BroadcastChannel("chaibuilder");
    const messages: any[] = [];
    otherTab.onmessage = (event) => messages.push(event.data);
    try {
      renderHookInBuilder(({ blocks }: { blocks: ChaiBlock[] }) => useWatchPageBlocks(blocks), {
        initialProps: { blocks: blocksA },
        builderProps: { pageId: "page-42" },
      });
      await waitFor(() => expect(messages).toHaveLength(1), { timeout: 2000 });
      expect(messages[0]).toEqual({
        type: "blocks-updated",
        pageId: "page-42",
        blocks: [{ _id: "a", _type: "WatchBox", title: "Default title" }],
      });
    } finally {
      otherTab.close();
    }
  });
});
