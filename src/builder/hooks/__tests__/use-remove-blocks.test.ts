/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { LOCKED_NAV_PAGE } from "./block-action-rules.fixtures";

describe("useRemoveBlocks action rules", () => {
  const render = () => renderHookInBuilder(() => useRemoveBlocks(), { blocks: LOCKED_NAV_PAGE });

  it("does not remove a block flagged _canDelete: false", () => {
    const { result, store } = render();
    act(() => result.current(["nav"]));
    expect(store.get(presentBlocksAtom)).toEqual(LOCKED_NAV_PAGE);
  });

  it("rejects a mixed selection and leaves every block in place", () => {
    const { result, store } = render();
    act(() => result.current(["copy", "nav"]));
    expect(store.get(presentBlocksAtom)).toEqual(LOCKED_NAV_PAGE);
  });

  it("removes the parent and its locked child with it", () => {
    const { result, store } = render();
    act(() => result.current(["hero"]));
    expect(store.get(presentBlocksAtom).map((block) => block._id)).toEqual(["freeNav"]);
  });

  it("still removes an unflagged instance of the same type", () => {
    const { result, store } = render();
    act(() => result.current(["freeNav"]));
    expect(store.get(presentBlocksAtom).map((block) => block._id)).toEqual(["hero", "nav", "copy"]);
  });
});
