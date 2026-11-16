// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { builderStore } from "~/builder/atoms/store";
import { canvasIframeAtom } from "~/builder/atoms/ui";
import {
  CANVAS_TOP_MARGIN,
  canvasContentHeightAtom,
  canvasPanAtom,
  canvasWrapperSizeAtom,
  pannableCanvasAtom,
} from "~/builder/hooks/use-pannable-canvas";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import CanvasArea from "./canvas-area";

const readOnly = { reason: "This page is linked", action: <button type="button">Duplicate and edit</button> };

// The canvas stores its iframe on mount, replacing any seeded one, so spy on the real iframe.
const spyOnCanvasScroll = async () => {
  await waitFor(() => expect(builderStore.get(canvasIframeAtom)?.contentWindow).toBeTruthy());
  return vi.spyOn(builderStore.get(canvasIframeAtom).contentWindow, "scrollBy").mockImplementation(() => undefined);
};

describe("CanvasArea on a view-only page", () => {
  it("covers the canvas with the reason and the action", async () => {
    renderInBuilder(<CanvasArea />, { builderProps: { readOnly } });

    expect(await screen.findByTestId("read-only-canvas-overlay")).toBeTruthy();
    expect(screen.getByText("This page is linked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate and edit" })).toBeTruthy();
  });

  it("drops a selection made before, so no block toolbar stays open", async () => {
    renderInBuilder(<CanvasArea />, { builderProps: { readOnly }, selectedBlockIds: ["a"] });

    await screen.findByTestId("read-only-canvas-overlay");
    expect(builderStore.get(selectedBlockIdsAtom)).toEqual([]);
  });

  it("still scrolls the page underneath", async () => {
    renderInBuilder(<CanvasArea />, { builderProps: { readOnly } });
    const scrollBy = await spyOnCanvasScroll();

    fireEvent.wheel(await screen.findByTestId("read-only-canvas-overlay"), { deltaX: 0, deltaY: 120 });

    expect(scrollBy).toHaveBeenCalledWith(0, 120);
  });

  it("pans the canvas instead in pannable mode, where the page does not scroll", async () => {
    renderInBuilder(<CanvasArea />, {
      builderProps: { readOnly },
      seed: (store) => {
        store.set(pannableCanvasAtom, true);
        // A page taller than the viewport, so there is room to pan down.
        store.set(canvasWrapperSizeAtom, { width: 1000, height: 600 });
        store.set(canvasContentHeightAtom, 3000);
        store.set(canvasPanAtom, { x: 0, y: CANVAS_TOP_MARGIN });
      },
    });
    const scrollBy = await spyOnCanvasScroll();

    fireEvent.wheel(await screen.findByTestId("read-only-canvas-overlay"), { deltaX: 0, deltaY: 120 });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(builderStore.get(canvasPanAtom).y).toBe(CANVAS_TOP_MARGIN - 120);
  });

  it("leaves an editable page uncovered", async () => {
    renderInBuilder(<CanvasArea />, { builderProps: { readOnly: null }, selectedBlockIds: ["a"] });

    await waitFor(() => expect(document.getElementById("canvas-iframe")).toBeTruthy());
    expect(screen.queryByTestId("read-only-canvas-overlay")).toBeNull();
    expect(builderStore.get(selectedBlockIdsAtom)).toEqual(["a"]);
  });
});
