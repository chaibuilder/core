/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { useAtom } from "jotai";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { treeRefAtom } from "~/builder/atoms/ui";
import { BuilderStoreProvider, renderInBuilder } from "~/tests/builder/render-in-builder";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { selectedStylingBlocksAtom } from "~/builder/hooks/use-selected-styling-blocks";
import type { ChaiBlock } from "~/types/common";
import { CanvasEventsWatcher } from "./canvas-events-watcher";

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe("CanvasEventsWatcher - styling selection", () => {
  it("picks up a styled element that appears when the selected block's props change", async () => {
    // Stands in for the canvas: a partial placement with no wrapper renders an unstyled span.
    const element = document.createElement("span");
    element.setAttribute("data-block-id", "p-1");
    document.body.appendChild(element);
    const placement = { _id: "p-1", _type: "PartialBlock", partialBlockId: "partial-1", wrapperTag: "none" };
    const { store } = renderInBuilder(<CanvasEventsWatcher />, {
      blocks: [placement as unknown as ChaiBlock],
      selectedBlockIds: ["p-1"],
    });
    await nextFrame();
    expect(store.get(selectedStylingBlocksAtom)).toEqual([]);

    // Choosing a wrapper re-renders the element with the block's styles prop.
    element.setAttribute("data-style-prop", "styles");
    element.setAttribute("data-style-id", "styles-p-1");
    element.setAttribute("data-block-parent", "p-1");
    act(() => store.set(presentBlocksAtom, [{ ...placement, wrapperTag: "div" } as unknown as ChaiBlock]));
    await nextFrame();

    expect(store.get(selectedStylingBlocksAtom)).toEqual([{ id: "styles-p-1", prop: "styles", blockId: "p-1" }]);
    element.remove();
  });
});

describe("CanvasEventsWatcher", () => {
  describe("Atom Integration", () => {
    it("should use real selectedBlockIdsAtom", () => {
      const { result } = renderHook(
        () => {
          const [blockIds, setBlockIds] = useAtom(selectedBlockIdsAtom);
          return { blockIds, setBlockIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.blockIds).toEqual([]);

      act(() => {
        result.current.setBlockIds(["block-1", "block-2"]);
      });

      expect(result.current.blockIds).toEqual(["block-1", "block-2"]);
    });

    it("should use real selectedStylingBlocksAtom", () => {
      const { result } = renderHook(
        () => {
          const [stylingBlocks, setStylingBlocks] = useAtom(selectedStylingBlocksAtom);
          return { stylingBlocks, setStylingBlocks };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.stylingBlocks).toEqual([]);

      act(() => {
        result.current.setStylingBlocks([{ id: "style-1", prop: "styles", blockId: "block-1" }]);
      });

      expect(result.current.stylingBlocks).toHaveLength(1);
      expect(result.current.stylingBlocks[0]).toEqual({
        id: "style-1",
        prop: "styles",
        blockId: "block-1",
      });
    });

    it("should use real treeRefAtom", () => {
      const { result } = renderHook(
        () => {
          const [treeRef, setTreeRef] = useAtom(treeRefAtom);
          return { treeRef, setTreeRef };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.treeRef).toBeNull();

      const mockTreeRef = {
        closeAll: vi.fn(),
        openAll: vi.fn(),
      };

      act(() => {
        result.current.setTreeRef(mockTreeRef as any);
      });

      expect(result.current.treeRef).toBe(mockTreeRef);
    });
  });

  describe("Event Handling Logic", () => {
    it("should handle CANVAS_BLOCK_SELECTED event data structure", () => {
      const { result } = renderHook(
        () => {
          const [blockIds, setBlockIds] = useAtom(selectedBlockIdsAtom);
          const [treeRef, setTreeRef] = useAtom(treeRefAtom);

          const handleBlockSelected = (blocks?: string[]) => {
            if (!blocks) return;
            if (blocks.length > 0 && !blockIds.includes(blocks[0])) {
              treeRef?.closeAll();
            }
            setBlockIds(blocks);
          };

          return { blockIds, setBlockIds, handleBlockSelected, setTreeRef };
        },
        { wrapper: BuilderStoreProvider },
      );

      const mockTreeRef = { closeAll: vi.fn(), openAll: vi.fn() };

      act(() => {
        result.current.setTreeRef(mockTreeRef as any);
      });

      act(() => {
        result.current.handleBlockSelected(["block-1", "block-2"]);
      });

      expect(result.current.blockIds).toEqual(["block-1", "block-2"]);
      expect(mockTreeRef.closeAll).toHaveBeenCalled();
    });

    it("should handle CANVAS_BLOCK_STYLE_SELECTED event data structure", () => {
      const { result } = renderHook(
        () => {
          const [blockIds, setBlockIds] = useAtom(selectedBlockIdsAtom);
          const [stylingBlocks, setStylingBlocks] = useAtom(selectedStylingBlocksAtom);
          const [treeRef, setTreeRef] = useAtom(treeRefAtom);

          const handleStyleSelected = (data?: { blockId: string; styleId: string; styleProp: string }) => {
            if (!data) return;
            const { blockId, styleId, styleProp } = data;
            if (!blockId) return;
            if (!blockIds.includes(blockId)) {
              treeRef?.closeAll();
            }
            setStylingBlocks([{ id: styleId, prop: styleProp, blockId }]);
            setBlockIds([blockId]);
          };

          return {
            blockIds,
            stylingBlocks,
            handleStyleSelected,
            setTreeRef,
          };
        },
        { wrapper: BuilderStoreProvider },
      );

      const mockTreeRef = { closeAll: vi.fn(), openAll: vi.fn() };

      act(() => {
        result.current.setTreeRef(mockTreeRef as any);
      });

      act(() => {
        result.current.handleStyleSelected({
          blockId: "block-1",
          styleId: "style-1",
          styleProp: "styles",
        });
      });

      expect(result.current.blockIds).toEqual(["block-1"]);
      expect(result.current.stylingBlocks).toEqual([{ id: "style-1", prop: "styles", blockId: "block-1" }]);
      expect(mockTreeRef.closeAll).toHaveBeenCalled();
    });

    it("should handle CLEAR_CANVAS_SELECTION event", () => {
      const { result } = renderHook(
        () => {
          const [blockIds, setBlockIds] = useAtom(selectedBlockIdsAtom);
          const [stylingBlocks, setStylingBlocks] = useAtom(selectedStylingBlocksAtom);

          const handleClearSelection = () => {
            setBlockIds([]);
            setStylingBlocks([]);
          };

          return {
            blockIds,
            stylingBlocks,
            setBlockIds,
            setStylingBlocks,
            handleClearSelection,
          };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setBlockIds(["block-1"]);
        result.current.setStylingBlocks([{ id: "style-1", prop: "styles", blockId: "block-1" }]);
      });

      expect(result.current.blockIds).toEqual(["block-1"]);
      expect(result.current.stylingBlocks).toHaveLength(1);

      act(() => {
        result.current.handleClearSelection();
      });

      expect(result.current.blockIds).toEqual([]);
      expect(result.current.stylingBlocks).toEqual([]);
    });
  });

  describe("Event Constants", () => {
    it("should have correct event names", () => {
      expect(CHAI_BUILDER_EVENTS.CANVAS_BLOCK_SELECTED).toBeDefined();
      expect(CHAI_BUILDER_EVENTS.CANVAS_BLOCK_STYLE_SELECTED).toBeDefined();
      expect(CHAI_BUILDER_EVENTS.CLEAR_CANVAS_SELECTION).toBeDefined();
    });
  });
});
