/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { useCutBlockIds } from "~/builder/hooks/use-cut-blockIds";
import { usePasteBlocks } from "~/builder/hooks/use-paste-blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { LOCKED_NAV_PAGE } from "./block-action-rules.fixtures";

describe("cut and paste action rules", () => {
  const render = () =>
    renderHookInBuilder(() => ({ cut: useCutBlockIds(), paste: usePasteBlocks() }), { blocks: LOCKED_NAV_PAGE });

  it("refuses to cut a block flagged _canMove: false", () => {
    const { result } = render();
    act(() => result.current.cut[1](["nav"]));
    expect(result.current.cut[0]).toEqual([]);
  });

  it("refuses to cut a mixed selection", () => {
    const { result } = render();
    act(() => result.current.cut[1](["copy", "nav"]));
    expect(result.current.cut[0]).toEqual([]);
  });

  it("cuts the parent of a locked block", () => {
    const { result } = render();
    act(() => result.current.cut[1](["hero"]));
    expect(result.current.cut[0]).toEqual(["hero"]);
  });

  it("cuts and pastes an unflagged block", async () => {
    const { result, store } = render();
    act(() => result.current.cut[1](["freeNav"]));
    expect(result.current.cut[0]).toEqual(["freeNav"]);
    await act(() => result.current.paste.pasteBlocks("hero"));
    expect(store.get(presentBlocksAtom).find((block) => block._id === "freeNav")?._parent).toBe("hero");
  });
});
