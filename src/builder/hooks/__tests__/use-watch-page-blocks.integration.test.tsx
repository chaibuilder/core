/**
 * @vitest-environment happy-dom
 *
 * Integration guard for the 0ms boot hop: proves that applying page blocks flips
 * `isPageLoaded` false->true across a real React commit, so `useBlockSelectionQuerySync`
 * resets its one-shot restore guard and re-preselects `?bid=` on an SPA page switch
 * (no remount). Uses real timers + the real jotai default store so the actual
 * scheduling order (state-render before the setTimeout(0) apply) is exercised.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { ChaiBlock } from "~/types/common";

// setAllBlocks writes the real presentBlocksAtom so selection-sync observes it.
vi.mock("~/builder/hooks/history/use-blocks-store-undoable-actions", async () => {
  const { builderStore } = await import("~/builder/atoms/store");
  const { presentBlocksAtom } = await import("~/builder/atoms/blocks");
  return {
    useBlocksStore: () => [
      builderStore.get(presentBlocksAtom),
      (b: ChaiBlock[]) => builderStore.set(presentBlocksAtom, b),
    ],
  };
});
vi.mock("~/builder/hooks/use-broadcast-channel", () => ({
  useBroadcastChannel: () => ({ postMessage: vi.fn() }),
}));
vi.mock("~/builder/hooks/use-builder-reset", () => ({
  useBuilderReset: () => () => {},
}));
vi.mock("~/builder/hooks/use-check-structure", () => ({
  useCheckStructure: () => () => {},
}));
vi.mock("~/registry", () => ({
  syncBlocksWithDefaultProps: (blocks: ChaiBlock[]) => blocks,
}));

import { useBlockSelectionQuerySync } from "~/builder/hooks/use-block-selection-query-sync";
import { useWatchPageBlocks } from "~/builder/hooks/use-watch-page-blocks";

const setUrlBid = (bid: string) =>
  window.history.replaceState({}, "", `/?bid=${bid}`);

const useBoot = ({ blocks }: { blocks: ChaiBlock[] }) => {
  useWatchPageBlocks(blocks);
  useBlockSelectionQuerySync();
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });

describe("useWatchPageBlocks + useBlockSelectionQuerySync (boot hop)", () => {
  beforeEach(() => {
    builderStore.set(isPageLoadedAtom, false);
    builderStore.set(presentBlocksAtom, []);
    builderStore.set(selectedBlockIdsAtom, []);
  });
  afterEach(() => vi.clearAllMocks());

  it("restores ?bid selection on initial boot", async () => {
    setUrlBid("B1");
    renderHook(useBoot, { initialProps: { blocks: [{ _id: "B1", _type: "Box" }] as ChaiBlock[] } });
    await settle();
    expect(builderStore.get(selectedBlockIdsAtom)).toEqual(["B1"]);
  });

  it("re-restores ?bid after an SPA page switch (guard reset on the false->true edge)", async () => {
    setUrlBid("B1");
    const { rerender } = renderHook(useBoot, {
      initialProps: { blocks: [{ _id: "B1", _type: "Box" }] as ChaiBlock[] },
    });
    await settle();
    expect(builderStore.get(selectedBlockIdsAtom)).toEqual(["B1"]);

    // SPA switch: new page (new blocks identity), new bid in URL, no remount.
    setUrlBid("B2");
    rerender({ blocks: [{ _id: "B2", _type: "Box" }] as ChaiBlock[] });
    await settle();
    expect(builderStore.get(selectedBlockIdsAtom)).toEqual(["B2"]);
  });
});
