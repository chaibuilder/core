/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider, WritableAtom } from "jotai";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import {
  getBlockIdFromUrl,
  updateBlockIdInUrl,
  useBlockSelectionQuerySync,
} from "~/builder/hooks/use-block-selection-query-sync";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { ChaiBlock } from "~/types/common";

type AtomTuple = [WritableAtom<any, any[], any>, any];

const createTestStore = (initialValues: AtomTuple[]) => {
  const store = createStore();
  initialValues.forEach(([atom, value]) => {
    store.set(atom, value);
  });
  return store;
};

const blocks: ChaiBlock[] = [
  { _id: "block-1", _type: "Box" },
  { _id: "block-2", _type: "Box", _parent: "block-1" },
  { _id: "block-3", _type: "Box" },
];

describe("getBlockIdFromUrl", () => {
  beforeEach(() => {
    // Reset URL before each test
    window.history.replaceState({}, "", "/");
  });

  it("should return null when no block param is present", () => {
    expect(getBlockIdFromUrl()).toBeNull();
  });

  it("should return block id from query param", () => {
    window.history.replaceState({}, "", "/?bid=block-1");
    expect(getBlockIdFromUrl()).toBe("block-1");
  });
});

describe("updateBlockIdInUrl", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("should set block query param", () => {
    updateBlockIdInUrl("block-1");
    expect(new URLSearchParams(window.location.search).get("bid")).toBe("block-1");
  });

  it("should remove block query param when null", () => {
    updateBlockIdInUrl("block-1");
    updateBlockIdInUrl(null);
    expect(new URLSearchParams(window.location.search).has("bid")).toBe(false);
  });

  it("should preserve other query params", () => {
    window.history.replaceState({}, "", "/?page=home&lang=en");
    updateBlockIdInUrl("block-2");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("bid")).toBe("block-2");
    expect(params.get("page")).toBe("home");
    expect(params.get("lang")).toBe("en");
  });
});

describe("useBlockSelectionQuerySync", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
  });

  it("should preselect block from URL on page load", async () => {
    window.history.replaceState({}, "", "/?bid=block-2");
    const store = createTestStore([
      [presentBlocksAtom, blocks],
      [isPageLoadedAtom, true],
    ]);

    renderHook(() => useBlockSelectionQuerySync(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    await waitFor(() => {
      expect(store.get(selectedBlockIdsAtom)).toEqual(["block-2"]);
    });
  });

  it("should clear stale block param if block does not exist", () => {
    window.history.replaceState({}, "", "/?bid=non-existent");
    const store = createTestStore([
      [presentBlocksAtom, blocks],
      [isPageLoadedAtom, true],
    ]);

    renderHook(() => useBlockSelectionQuerySync(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    expect(new URLSearchParams(window.location.search).has("bid")).toBe(false);
  });

  it("should not preselect block when page is not loaded", () => {
    window.history.replaceState({}, "", "/?bid=block-1");
    const store = createTestStore([
      [presentBlocksAtom, blocks],
      [selectedBlockIdsAtom, []],
      [isPageLoadedAtom, false],
    ]);

    renderHook(() => useBlockSelectionQuerySync(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    expect(store.get(selectedBlockIdsAtom)).toEqual([]);
  });

  it("should update URL when block selection changes", () => {
    const store = createTestStore([
      [presentBlocksAtom, blocks],
      [selectedBlockIdsAtom, []],
      [isPageLoadedAtom, true],
    ]);

    renderHook(() => useBlockSelectionQuerySync(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => {
      store.set(selectedBlockIdsAtom, ["block-3"]);
    });

    expect(new URLSearchParams(window.location.search).get("bid")).toBe("block-3");
  });

  it("should remove block param from URL when selection is cleared", async () => {
    window.history.replaceState({}, "", "/?bid=block-1");
    const store = createTestStore([
      [presentBlocksAtom, blocks],
      [selectedBlockIdsAtom, []],
      [isPageLoadedAtom, true],
    ]);

    renderHook(() => useBlockSelectionQuerySync(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    // First it restores block-1 from URL
    await waitFor(() => {
      expect(store.get(selectedBlockIdsAtom)).toEqual(["block-1"]);
    });

    // Now clear selection
    act(() => {
      store.set(selectedBlockIdsAtom, []);
    });

    expect(new URLSearchParams(window.location.search).has("bid")).toBe(false);
  });
});
