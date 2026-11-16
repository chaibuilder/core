/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom, structureErrorsAtom, structureValidationValidAtom } from "~/builder/atoms/blocks";
import { userActionsCountAtom } from "~/builder/atoms/builder";
import { canvasIframeAtom } from "~/builder/atoms/ui";
import { useBlocksStoreManager } from "~/builder/hooks/history/use-blocks-store-manager";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";

/**
 * A canvas document whose structure breaks the real "no-nested-div-in-p" rule, so a validation run
 * is observable as a populated `structureErrorsAtom`.
 */
const invalidCanvas = () => {
  const doc = document.implementation.createHTMLDocument("canvas");
  const p = doc.createElement("p");
  const box = doc.createElement("div");
  box.setAttribute("data-block-type", "Box");
  box.setAttribute("data-block-id", "box-1");
  p.appendChild(box);
  doc.body.appendChild(p);
  return { contentDocument: doc } as unknown as HTMLIFrameElement;
};

describe("useBlocksStoreManager – updateBlocksProps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const render = () =>
    renderHookInBuilder(() => useBlocksStoreManager(), {
      blocks: [{ _id: "block-1", _type: "Box", color: "blue" }],
      seed: (s) => s.set(canvasIframeAtom, invalidCanvas()),
    });

  it("runs structure validation after updating props", async () => {
    const { result, store } = render();

    act(() => {
      result.current.updateBlocksProps([{ _id: "block-1", color: "red" }]);
    });

    expect(store.get(presentBlocksAtom)[0]).toMatchObject({ _id: "block-1", color: "red" });
    expect(store.get(structureErrorsAtom)).toEqual([]);
    expect(store.get(userActionsCountAtom)).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(store.get(structureErrorsAtom)).toEqual([expect.objectContaining({ id: "div-in-paragraph-box-1" })]);
    expect(store.get(structureValidationValidAtom)).toBe(false);
  });

  it("runs structure validation even when an empty blocks array is provided", async () => {
    const { result, store } = render();

    act(() => {
      result.current.updateBlocksProps([]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(store.get(structureErrorsAtom)).toEqual([expect.objectContaining({ id: "div-in-paragraph-box-1" })]);
    expect(store.get(presentBlocksAtom)).toEqual([{ _id: "block-1", _type: "Box", color: "blue" }]);
  });
});
