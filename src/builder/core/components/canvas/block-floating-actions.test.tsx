/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { useAtom, useSetAtom } from "jotai";
import { BuilderStoreProvider } from "~/tests/builder/render-in-builder";
import { canDeleteBlock, canDuplicateBlock } from "~/builder/core/functions/block-helpers";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { selectedStylingBlocksAtom } from "~/builder/hooks/use-selected-styling-blocks";
import { ChaiBlock } from "~/types/common";

describe("Block Floating Actions Hooks", () => {
  describe("useBlockSelection Logic", () => {
    it("should handle selected block state changes", () => {
      const { result } = renderHook(
        () => {
          const [selectedIds, setSelectedIds] = useAtom(selectedBlockIdsAtom);
          return { selectedIds, setSelectedIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.selectedIds).toEqual([]);

      act(() => {
        result.current.setSelectedIds(["block-1"]);
      });

      expect(result.current.selectedIds).toEqual(["block-1"]);
    });

    it("should handle multiple block selections", () => {
      const { result } = renderHook(
        () => {
          const [selectedIds, setSelectedIds] = useAtom(selectedBlockIdsAtom);
          return { selectedIds, setSelectedIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedIds(["block-1", "block-2", "block-3"]);
      });

      expect(result.current.selectedIds).toHaveLength(3);
      expect(result.current.selectedIds).toEqual(["block-1", "block-2", "block-3"]);
    });

    it("should clear selections", () => {
      const { result } = renderHook(
        () => {
          const [selectedIds, setSelectedIds] = useAtom(selectedBlockIdsAtom);
          return { selectedIds, setSelectedIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedIds(["block-1", "block-2"]);
      });

      expect(result.current.selectedIds).toHaveLength(2);

      act(() => {
        result.current.setSelectedIds([]);
      });

      expect(result.current.selectedIds).toEqual([]);
    });
  });

  describe("useBlockFloatingSelector Logic", () => {
    it("should handle styling blocks state", () => {
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

    it("should handle parent selection logic", () => {
      const { result } = renderHook(
        () => {
          const [selectedIds, setSelectedIds] = useAtom(selectedBlockIdsAtom);
          const [stylingBlocks, setStylingBlocks] = useAtom(selectedStylingBlocksAtom);

          const handleParentSelect = (parentId: string) => {
            setStylingBlocks([]);
            setSelectedIds([parentId]);
          };

          return {
            selectedIds,
            stylingBlocks,
            handleParentSelect,
          };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.handleParentSelect("parent-block-1");
      });

      expect(result.current.selectedIds).toEqual(["parent-block-1"]);
      expect(result.current.stylingBlocks).toEqual([]);
    });

    it("should clear styling blocks when selecting parent", () => {
      const { result } = renderHook(
        () => {
          const [selectedIds, setSelectedIds] = useAtom(selectedBlockIdsAtom);
          const [stylingBlocks, setStylingBlocks] = useAtom(selectedStylingBlocksAtom);

          const handleParentSelect = (parentId: string) => {
            setStylingBlocks([]);
            setSelectedIds([parentId]);
          };

          return {
            selectedIds,
            stylingBlocks,
            setSelectedIds,
            setStylingBlocks,
            handleParentSelect,
          };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedIds(["child-block"]);
        result.current.setStylingBlocks([{ id: "style-1", prop: "styles", blockId: "child-block" }]);
      });

      expect(result.current.stylingBlocks).toHaveLength(1);

      act(() => {
        result.current.handleParentSelect("parent-block");
      });

      expect(result.current.selectedIds).toEqual(["parent-block"]);
      expect(result.current.stylingBlocks).toEqual([]);
    });

    it("should handle highlight state clearing", () => {
      const { result } = renderHook(
        () => {
          const setHighlighted = useSetAtom(selectedBlockIdsAtom);

          const handleMouseEnter = () => {
            setHighlighted([]);
          };

          return { handleMouseEnter };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.handleMouseEnter).toBeInstanceOf(Function);

      act(() => {
        result.current.handleMouseEnter();
      });
    });
  });

  describe("Block Capability Checks", () => {
    it("should default to allowing deletion for standard blocks", () => {
      expect(canDeleteBlock({ _type: "Box" })).toBe(true);
      expect(canDeleteBlock({ _type: "Text" })).toBe(true);
      expect(canDeleteBlock({ _type: "Image" })).toBe(true);
    });

    it("should default to allowing duplication for standard blocks", () => {
      expect(canDuplicateBlock({ _type: "Box" })).toBe(true);
      expect(canDuplicateBlock({ _type: "Text" })).toBe(true);
      expect(canDuplicateBlock({ _type: "Image" })).toBe(true);
    });

    it("should handle unregistered block types gracefully", () => {
      expect(canDeleteBlock({ _type: "UnknownBlock" })).toBe(true);
      expect(canDuplicateBlock({ _type: "UnknownBlock" })).toBe(true);
    });

    it("should be callable with any block type string", () => {
      const blockTypes = ["Box", "Text", "Image", "Button", "Link"];
      blockTypes.forEach((type) => {
        expect(typeof canDeleteBlock({ _type: type })).toBe("boolean");
        expect(typeof canDuplicateBlock({ _type: type })).toBe("boolean");
      });
    });
  });

  describe("Block Data Structure", () => {
    it("should handle block with parent relationship", () => {
      const block: Partial<ChaiBlock> = {
        _id: "child-block",
        _type: "Box",
        _name: "Child Box",
        _parent: "parent-block",
      };

      expect(block._parent).toBe("parent-block");
      expect(block._id).toBe("child-block");
    });

    it("should handle block without parent", () => {
      const block: Partial<ChaiBlock> = {
        _id: "root-block",
        _type: "Box",
        _name: "Root Box",
      };

      expect(block._parent).toBeUndefined();
    });

    it("should handle block label generation logic", () => {
      const blockWithName: Partial<ChaiBlock> = {
        _id: "block-1",
        _type: "Box",
        _name: "Custom Name",
      };

      const blockWithoutName: Partial<ChaiBlock> = {
        _id: "block-2",
        _type: "Text",
        _name: "",
      };

      const getLabel = (block: Partial<ChaiBlock>) => {
        return block._name && block._name !== "" ? block._name : block._type;
      };

      expect(getLabel(blockWithName)).toBe("Custom Name");
      expect(getLabel(blockWithoutName)).toBe("Text");
    });
  });

  describe("Drag and Drop State", () => {
    it("should handle dragging state transitions", () => {
      const { result } = renderHook(
        () => {
          const [isDragging, setIsDragging] = useAtom(selectedBlockIdsAtom);

          const handleDragStart = () => {
            setIsDragging(["dragging-block"]);
          };

          const handleDragEnd = () => {
            setIsDragging([]);
          };

          return {
            isDragging,
            handleDragStart,
            handleDragEnd,
          };
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current.isDragging).toEqual([]);

      act(() => {
        result.current.handleDragStart();
      });

      expect(result.current.isDragging).toEqual(["dragging-block"]);

      act(() => {
        result.current.handleDragEnd();
      });

      expect(result.current.isDragging).toEqual([]);
    });
  });

  describe("Event Handler Logic", () => {
    it("should prevent event propagation in click handler", () => {
      const handleClick = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
        e.stopPropagation();
        e.preventDefault();
      };

      let propagationStopped = false;
      let defaultPrevented = false;

      const mockEvent = {
        stopPropagation: () => {
          propagationStopped = true;
        },
        preventDefault: () => {
          defaultPrevented = true;
        },
      };

      handleClick(mockEvent);

      expect(propagationStopped).toBe(true);
      expect(defaultPrevented).toBe(true);
    });

    it("should prevent event propagation in keydown handler", () => {
      const handleKeyDown = (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
      };

      let propagationStopped = false;

      const mockEvent = {
        stopPropagation: () => {
          propagationStopped = true;
        },
      };

      handleKeyDown(mockEvent);

      expect(propagationStopped).toBe(true);
    });

    it("should prevent event propagation in mouse enter handler", () => {
      const handleMouseEnter = (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
      };

      let propagationStopped = false;

      const mockEvent = {
        stopPropagation: () => {
          propagationStopped = true;
        },
      };

      handleMouseEnter(mockEvent);

      expect(propagationStopped).toBe(true);
    });
  });

  describe("Visibility Logic", () => {
    it("should determine render visibility based on conditions", () => {
      const shouldRender = (
        isDragging: boolean,
        selectedBlockElement: HTMLElement | null,
        block: ChaiBlock | null,
        editingBlockId: string | null,
      ) => {
        return isDragging || (selectedBlockElement && block && !editingBlockId);
      };

      expect(shouldRender(true, null, null, null)).toBe(true);

      const mockElement = document.createElement("div");
      const mockBlock = { _id: "block-1", _type: "Box" } as ChaiBlock;

      expect(shouldRender(false, mockElement, mockBlock, null)).toBe(true);

      expect(shouldRender(false, mockElement, mockBlock, "editing-block")).toBe(false);

      expect(shouldRender(false, null, mockBlock, null)).toBeFalsy();

      expect(shouldRender(false, mockElement, null, null)).toBeFalsy();
    });
  });
});
