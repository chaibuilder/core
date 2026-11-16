/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dragAndDropAtom,
  dropIndicatorAtom,
  setIsDragging,
} from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks/use-drag-and-drop";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { sidebarActivePanelAtom, sidebarPanelSwapAtom } from "~/builder/hooks/use-sidebar-active-panel";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { useBlockDragStart } from "./use-block-drag-start";

const dragEvent = () => ({ dataTransfer: { effectAllowed: "", setData: vi.fn(), setDragImage: vi.fn() } }) as any;

const renderDragStart = (activePanel: string | null = "add-block") =>
  renderHookInBuilder(() => useBlockDragStart(), {
    selectedBlockIds: ["block-1"],
    seed: (s) => s.set(sidebarActivePanelAtom, activePanel),
  });

describe("useBlockDragStart", () => {
  afterEach(() => {
    vi.useRealTimers();
    setIsDragging(false);
  });

  it("shows Outline when a block is dragged from the Add panel", () => {
    vi.useFakeTimers();
    const { result, store } = renderDragStart();

    act(() => result.current(dragEvent(), {} as any, true));
    expect(store.get(sidebarActivePanelAtom)).toBe("add-block");

    act(() => vi.runAllTimers());

    expect(store.get(sidebarActivePanelAtom)).toBe("outline");
  });

  it("starts the panel swap so Add Blocks slides out before Outline slides in", () => {
    const { result, store } = renderDragStart();

    act(() => result.current(dragEvent(), {} as any, true));

    expect(store.get(sidebarPanelSwapAtom)).toBe("add-block");
    expect(store.get(dragAndDropAtom)).toEqual({});
    expect(store.get(selectedBlockIdsAtom)).toEqual([]);
    expect(store.get(dropIndicatorAtom)).toMatchObject({ isVisible: true, targetBlockId: "canvas" });
  });

  it("does not swap panels when the drag starts outside the Add Blocks panel", () => {
    const { result, store } = renderDragStart("images");

    act(() => result.current(dragEvent(), {} as any, true));

    expect(store.get(sidebarPanelSwapAtom)).toBeNull();
  });

  it("keeps the active panel when moving an existing canvas block", () => {
    vi.useFakeTimers();
    const { result, store } = renderDragStart();

    act(() => result.current(dragEvent(), {} as any, false));
    act(() => vi.runAllTimers());

    expect(store.get(sidebarActivePanelAtom)).toBe("add-block");
    expect(store.get(sidebarPanelSwapAtom)).toBeNull();
  });
});
