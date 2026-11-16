// @vitest-environment happy-dom
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderStore } from "~/builder/atoms/store";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { ChaiBlock } from "~/types/common";
import { blockRepeaterDataAtom, useAsyncProps } from "./use-async-props";

// The host's data-provider callback, passed in as a builder prop.
const getBlockAsyncProps = vi.fn();
const builderProps = { getBlockAsyncProps };

const block = (heading: string) => ({ _id: "block-1", _type: "MyBlock", heading }) as unknown as ChaiBlock;

// The hook spreads resolved async props over `$loading`, so its static return type is just
// `{ $loading: boolean }`. Widen it here to read the props the fixtures resolve.
const renderAsyncProps = (heading: string) =>
  renderHookInBuilder(({ block: b }) => useAsyncProps(b, "live", ["heading"]) as Record<string, any>, {
    initialProps: { block: block(heading) },
    builderProps,
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
  renderHookInBuilder(({ block: b }) => useAsyncProps(b, "live", ["repeaterItems", "filters"]), {
    initialProps: { block: collectionItem(filters) },
    builderProps,
  });

describe("useAsyncProps for a CollectionItem", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getBlockAsyncProps.mockReset();
    getBlockAsyncProps.mockResolvedValue({ items: [{ slug: "a" }] });
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
    expect(builderStore.get(blockRepeaterDataAtom)["ci-1"]?.props).toEqual([{ slug: "a" }]);

    rerender({ block: collectionItem([]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(builderStore.get(blockRepeaterDataAtom)["ci-1"]).toBeUndefined();
    expect(getBlockAsyncProps).toHaveBeenCalledTimes(1);
  });
});
