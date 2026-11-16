/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { useDuplicateBlocks } from "~/builder/hooks/use-duplicate-blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { LOCKED_NAV_PAGE } from "./block-action-rules.fixtures";

describe("useDuplicateBlocks action rules", () => {
  const render = () => renderHookInBuilder(() => useDuplicateBlocks(), { blocks: LOCKED_NAV_PAGE });

  it("does not duplicate a block flagged _canDuplicate: false", () => {
    const { result, store } = render();
    act(() => result.current(["nav"]));
    expect(store.get(presentBlocksAtom)).toEqual(LOCKED_NAV_PAGE);
  });

  it("rejects a mixed selection", () => {
    const { result, store } = render();
    act(() => result.current(["freeNav", "nav"]));
    expect(store.get(presentBlocksAtom)).toEqual(LOCKED_NAV_PAGE);
  });

  it("duplicates the parent of a locked block, locked child included", () => {
    const { result, store } = render();
    act(() => result.current(["hero"]));
    expect(store.get(presentBlocksAtom)).toHaveLength(LOCKED_NAV_PAGE.length + 3);
  });

  it("duplicates an unflagged instance of the same type", () => {
    const { result, store } = render();
    act(() => result.current(["freeNav"]));
    expect(store.get(presentBlocksAtom)).toHaveLength(LOCKED_NAV_PAGE.length + 1);
  });
});
