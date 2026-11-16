/**
 * ============================================================================
 * USE DIRECT BLOCK DRAG HOOK
 * ============================================================================
 *
 * Hook that enables direct click-and-drag functionality for blocks in the canvas.
 * Users can click and hold any block to immediately start dragging without
 * needing to select it first or use the floating action toolbar.
 *
 * @module use-direct-block-drag
 */

import { useSetAtom } from "jotai";
import { find } from "lodash-es";
import { useCallback, useMemo, useRef } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { canMoveBlock } from "~/builder/core/functions/block-helpers";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { useDragAndDrop } from ".";

interface DirectDragHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

/**
 * @HOOK useDirectBlockDrag
 * @description
 * Enables direct click-and-drag functionality for canvas blocks.
 * Automatically selects the block and initiates drag on mousedown + movement.
 *
 * Features:
 * - Detects mousedown on block
 * - Automatically selects the block
 * - Initiates drag on slight mouse movement
 * - Provides smooth transition from click to drag
 * - Works with existing drag-and-drop system
 *
 * @param block - The ChaiBlock to enable direct dragging for
 * @param enabled - Whether direct dragging is enabled (default: true)
 * @returns Object with mouseDown and dragStart handlers
 *
 * @example
 * const { onMouseDown, onDragStart } = useDirectBlockDrag(block);
 * <div onMouseDown={onMouseDown} onDragStart={onDragStart} draggable />
 */
export const useDirectBlockDrag = (): DirectDragHandlers => {
  // PERF: setter-only — does not subscribe to selectedBlockIdsAtom
  const setSelectedBlockIds = useSetAtom(selectedBlockIdsAtom);
  const { onDragStart, onDragEnd } = useDragAndDrop();
  const dragBlockIdRef = useRef<string | null>(null);

  /**
   * Handle mousedown - prepare for potential drag
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left mouse button
      if (e.button !== 0) return;
      // Second press of a double-click: let the dblclick -> inline-edit flow own it
      if (e.detail >= 2) return;

      const target = e.target as HTMLElement;

      // Check if clicking on a child block (let child handle it)
      const clickedBlockId = target.closest("[data-block-id]")?.getAttribute("data-block-id");
      if (!clickedBlockId || clickedBlockId === "canvas") return;

      // Select this block immediately on mousedown
      setSelectedBlockIds((prev) => (prev.length === 1 && prev[0] === clickedBlockId ? prev : [clickedBlockId]));
      dragBlockIdRef.current = clickedBlockId;
    },
    [setSelectedBlockIds],
  );

  /**
   * Handle dragstart - initiate the drag operation
   */
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Innermost draggable block owns the drag; ancestors must not re-initiate
      e.stopPropagation();

      const blockId =
        dragBlockIdRef.current ??
        (e.target as HTMLElement).closest?.("[data-block-id]")?.getAttribute("data-block-id") ??
        null;
      if (!blockId || blockId === "canvas") return;

      // PERF: read on-demand via store — no subscription to presentBlocksAtom
      const allBlocks = builderStore.get(presentBlocksAtom);
      const selectedBlock = find(allBlocks, { _id: blockId });
      if (selectedBlock && !canMoveBlock(selectedBlock)) {
        e.preventDefault();
        return;
      }
      if (selectedBlock) {
        onDragStart(e, selectedBlock, false);
      }
    },
    [onDragStart],
  );

  /**
   * Handle dragend - terminate the drag operation
   */
  const handleDragEnd = useCallback(() => {
    onDragEnd();
    dragBlockIdRef.current = null;
  }, [onDragEnd]);

  // PERF: stable object reference — prevents blockProps useMemo from invalidating
  return useMemo(
    () => ({ onMouseDown: handleMouseDown, onDragStart: handleDragStart, onDragEnd: handleDragEnd }),
    [handleMouseDown, handleDragStart, handleDragEnd],
  );
};
