// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChaiBlock } from "~/types/common";
import { blockRepeaterDataAtom, useAsyncProps } from "./use-async-props";

const getBlockAsyncProps = vi.fn();

vi.mock("~/builder/hooks/use-builder-prop", () => ({
  useBuilderProp: () => getBlockAsyncProps,
}));

vi.mock("~/builder/hooks/use-update-blocks-props", () => ({
  useUpdateBlocksPropsRealtime: () => vi.fn(),
}));

const block = (heading: string) => ({ _id: "block-1", _type: "MyBlock", heading }) as unknown as ChaiBlock;

// The hook spreads resolved async props over `$loading`, so its static return type is just
// `{ $loading: boolean }`. Widen it here to read the props the fixtures resolve.
const renderAsyncProps = (heading: string) =>
  renderHook(({ block: b }) => useAsyncProps(b, "live", ["heading"]) as Record<string, any>, {
    initialProps: { block: block(heading) },
  });

describe("useAsyncProps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getBlockAsyncProps.mockReset();
    getBlockAsyncProps.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes a single call for a burst of setting changes", async () => {
    const { rerender } = renderAsyncProps("a");

    rerender({ block: block("ab") });
    rerender({ block: block("abc") });
    expect(getBlockAsyncProps).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(getBlockAsyncProps).toHaveBeenCalledTimes(1);
    expect(getBlockAsyncProps).toHaveBeenCalledWith({ block: block("abc") });
  });

  it("calls again once the next change settles", async () => {
    const { rerender } = renderAsyncProps("a");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    rerender({ block: block("b") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(getBlockAsyncProps).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that arrives after the deps changed again", async () => {
    let resolveStale: (props: object) => void = () => {};
    getBlockAsyncProps.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        }),
    );
    getBlockAsyncProps.mockResolvedValueOnce({ title: "current" });

    const { result, rerender } = renderAsyncProps("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    rerender({ block: block("b") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.title).toBe("current");

    await act(async () => {
      resolveStale({ title: "stale" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.title).toBe("current");
  });
});

const collectionItem = (filters?: unknown[]) =>
  ({ _id: "ci-1", _type: "CollectionItem", repeaterItems: "{{#agents}}", filters }) as unknown as ChaiBlock;

const renderCollectionItem = (filters?: unknown[]) =>
  renderHook(({ block: b }) => useAsyncProps(b, "live", ["repeaterItems", "filters"]), {
    initialProps: { block: collectionItem(filters) },
  });

describe("useAsyncProps for a CollectionItem", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getBlockAsyncProps.mockReset();
    getBlockAsyncProps.mockResolvedValue({ items: [{ slug: "a" }] });
    getDefaultStore().set(blockRepeaterDataAtom, {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch when the block has no filters", async () => {
    renderCollectionItem();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(getBlockAsyncProps).not.toHaveBeenCalled();
  });

  it("fetches once a filter is set", async () => {
    renderCollectionItem([{ field: "slug", operator: "equals", value: "a" }]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(getBlockAsyncProps).toHaveBeenCalledTimes(1);
  });

  it("drops the previously found item when the last filter is removed", async () => {
    const { rerender } = renderCollectionItem([{ field: "slug", operator: "equals", value: "a" }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(getDefaultStore().get(blockRepeaterDataAtom)["ci-1"]?.props).toEqual([{ slug: "a" }]);

    rerender({ block: collectionItem([]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(getDefaultStore().get(blockRepeaterDataAtom)["ci-1"]).toBeUndefined();
    expect(getBlockAsyncProps).toHaveBeenCalledTimes(1);
  });
});
