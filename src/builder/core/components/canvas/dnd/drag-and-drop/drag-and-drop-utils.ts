/**
 * ============================================================================
 * DRAG AND DROP UTILITIES FOR VISUAL BUILDER
 * ============================================================================
 *
 * This file contains intelligent placeholder positioning logic that:
 * - Prioritizes pointer position over target element boundaries
 * - Detects gaps between elements in grid/flex layouts
 * - Handles edge-based placement zones with dynamic sizing
 * - Supports deeply nested layouts with mixed orientations
 * - Provides smart zone detection based on element size
 * - Prevents dropping inside leaf blocks (elements that cannot have children)
 *
 * @module drag-and-drop-utils
 * @author ChaiBuilder Team
 */

import { getComputedStyleOf, getOrientation } from "~/builder/core/components/canvas/dnd/getOrientation";
import { canAcceptChildBlock } from "~/builder/core/functions/block-helpers";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Block types that cannot accept children (leaf nodes in the tree)
 * These blocks will only allow before/after positioning, never inside
 */
const LEAF_BLOCK_TYPES = [
  "Heading",
  "Text",
  "Image",
  "Paragraph",
  "Icon",
  "Input",
  "Radio",
  "Checkbox",
  "Select",
  "CustomHTML",
  "TextArea",
  "Divider",
  "Repeater",
  "Video",
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * @FUNCTION_NAME isLeafBlock
 * @arguments { blockType: string }
 * @description
 * Checks if a block type is a leaf block (cannot accept children).
 * Leaf blocks will only allow before/after drop positions, never inside.
 *
 * @param blockType - The type of block to check
 * @returns True if the block is a leaf block, false otherwise
 */
function isLeafBlock(blockType: string): boolean {
  try {
    return LEAF_BLOCK_TYPES.includes(blockType as any);
  } catch {
    return false;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration object for smart zone detection
 * Adjust these values to fine-tune the drag and drop behavior
 */
const ZONE_CONFIG = {
  /** Minimum edge zone size in pixels */
  MIN_EDGE_ZONE: 10,

  /** Maximum edge zone size in pixels */
  MAX_EDGE_ZONE: 30,

  /** Percentage of element size to use for edge zones (0.2 = 20%) */
  EDGE_ZONE_PERCENTAGE: 0.2,

  /** Gap detection threshold - minimum space between elements to show gap placeholder */
  GAP_THRESHOLD: 8,

  /** Minimum element size (width/height) to enable dynamic edge zones */
  MIN_SIZE_FOR_EDGE_ZONES: 50,

  /** Distance from parent edge (in pixels) to trigger parent-level placement */
  PARENT_EDGE_PROXIMITY: 20,
} as const;

// ============================================================================
// RECT CACHE
// ============================================================================

/**
 * Per-detection cache of element rects. detectDropZone and its helpers measure
 * the same elements repeatedly (sort comparators, row scans, fallback loops);
 * reading each rect once per detection avoids forced layouts that scale with
 * the number of child blocks. No DOM writes happen during a detection pass, so
 * the cached rects stay valid. Reset at the start of every detectDropZone call.
 */
let rectCache = new WeakMap<HTMLElement, DOMRect>();

function resetRectCache(): void {
  rectCache = new WeakMap();
}

function getRect(element: HTMLElement): DOMRect {
  let rect = rectCache.get(element);
  if (!rect) {
    rect = element.getBoundingClientRect();
    rectCache.set(element, rect);
  }
  return rect;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Represents a detected drop zone with position, orientation, and metadata
 * This is the primary return type for drop zone detection
 */
export interface DropZone {
  position: "before" | "after" | "inside";
  placeholderOrientation: "vertical" | "horizontal";
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  targetElement: HTMLElement;
  targetBlockId: string;
  targetParentId?: string;
  isGapZone?: boolean; // True if this is a gap between elements
  isEmpty?: boolean; // True if target is an empty container
  confidence: number; // 0-1, how confident we are this is the intended drop zone
}

/**
 * @FUNCTION_NAME calculateEdgeZoneSize
 * @arguments { elementSize: number }
 * @description
 * Calculates the dynamic edge zone size based on element dimensions.
 * Edge zones are the areas at the start/end of an element that trigger before/after positioning.
 *
 * Logic:
 * - Elements < 50px: No edge zones (returns 0)
 * - Elements >= 50px: 20% of size, clamped between 10-30px
 *
 * Example: 200px element → 40px → clamped to 30px edge zone
 *
 * @param elementSize - The width or height of the element in pixels
 * @returns The calculated edge zone size in pixels (0 if element too small)
 */
function calculateEdgeZoneSize(elementSize: number): number {
  try {
    // No edge zones for small elements - prevents overly sensitive zones
    if (elementSize < ZONE_CONFIG.MIN_SIZE_FOR_EDGE_ZONES) {
      return 0;
    }

    // Calculate 20% of element size
    const dynamicSize = elementSize * ZONE_CONFIG.EDGE_ZONE_PERCENTAGE;

    // Clamp between MIN and MAX to ensure consistent UX
    return Math.max(ZONE_CONFIG.MIN_EDGE_ZONE, Math.min(ZONE_CONFIG.MAX_EDGE_ZONE, dynamicSize));
  } catch {
    return ZONE_CONFIG.MIN_EDGE_ZONE; // Fallback to minimum
  }
}

/**
 * @FUNCTION_NAME getChildBlocks
 * @arguments { element: HTMLElement }
 * @description
 * Retrieves all direct child elements that have a data-block-id attribute.
 * Only returns immediate children, not nested descendants.
 *
 * @param element - The parent element to search
 * @returns Array of child HTMLElements with data-block-id attribute
 */
function getChildBlocks(element: HTMLElement): HTMLElement[] {
  try {
    const children: HTMLElement[] = [];
    const childNodes = element.children;

    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i] as HTMLElement;
      if (child.hasAttribute("data-block-id")) {
        children.push(child);
      }
    }

    return children;
  } catch {
    return [];
  }
}

/**
 * @FUNCTION_NAME hasChildBlocks
 * @arguments { element: HTMLElement }
 * @description
 * Checks if an element has any child blocks (elements with data-block-id).
 * Used to determine if a container is empty or has content.
 *
 * @param element - The element to check
 * @returns True if element has child blocks, false otherwise
 */
function hasChildBlocks(element: HTMLElement): boolean {
  try {
    return getChildBlocks(element).length > 0;
  } catch {
    return false;
  }
}

/**
 * @FUNCTION_NAME detectGapZone
 * @arguments { container, pointerX, pointerY, orientation }
 * @description
 * Detects if the pointer is positioned in a gap between sibling elements.
 * This enables showing placeholders in the space between cards/items in grid/flex layouts.
 *
 * Logic:
 * - Iterates through all child blocks
 * - For each pair of adjacent children, checks if pointer is in the space between them
 * - Only considers it a gap if the space is >= GAP_THRESHOLD (8px)
 * - Returns the elements before and after the gap for precise placeholder positioning
 *
 * @param container - The parent container element
 * @param pointerX - X coordinate of the pointer
 * @param pointerY - Y coordinate of the pointer
 * @param orientation - Layout orientation of the container
 * @returns Object with 'before' and 'after' elements if gap found, null otherwise
 */
function detectGapZone(
  container: HTMLElement,
  pointerX: number,
  pointerY: number,
  orientation: "vertical" | "horizontal",
): { before: HTMLElement; after: HTMLElement } | null {
  try {
    const children = getChildBlocks(container);

    // Need at least 2 children to have a gap between them
    if (children.length < 2) {
      return null;
    }

    // For multi-row grids, we need to find gaps in the same visual row
    // First, find the closest sibling in the same row as the pointer
    const closestInRow = findClosestSiblingInRow(children, pointerX, pointerY, orientation);

    if (closestInRow) {
      // Get all siblings in the same row as the closest element
      const siblingsInRow = getSiblingsInSameRow(children, closestInRow, orientation);

      // Sort siblings by their position (left to right for horizontal, top to bottom for vertical)
      siblingsInRow.sort((a, b) => {
        const aRect = getRect(a);
        const bRect = getRect(b);
        return orientation === "vertical" ? aRect.top - bRect.top : aRect.left - bRect.left;
      });

      // Check gaps between siblings in the same row
      for (let i = 0; i < siblingsInRow.length - 1; i++) {
        const current = siblingsInRow[i];
        const next = siblingsInRow[i + 1];

        const currentRect = getRect(current);
        const nextRect = getRect(next);

        if (orientation === "vertical") {
          // Vertical layout: check for horizontal gaps (space between vertically stacked items)
          const gapStart = currentRect.bottom;
          const gapEnd = nextRect.top;
          const gapSize = gapEnd - gapStart;

          // Check if pointer is within the gap boundaries
          const isInGapVertically = pointerY >= gapStart && pointerY <= gapEnd;
          const isInGapHorizontally =
            pointerX >= Math.min(currentRect.left, nextRect.left) &&
            pointerX <= Math.max(currentRect.right, nextRect.right);

          if (isInGapVertically && isInGapHorizontally && gapSize >= ZONE_CONFIG.GAP_THRESHOLD) {
            return { before: current, after: next };
          }
        } else {
          // Horizontal layout: check for vertical gaps (space between horizontally arranged items)
          const gapStart = currentRect.right;
          const gapEnd = nextRect.left;
          const gapSize = gapEnd - gapStart;

          // Check if pointer is within the gap boundaries
          const isInGapHorizontally = pointerX >= gapStart && pointerX <= gapEnd;
          const isInGapVertically =
            pointerY >= Math.min(currentRect.top, nextRect.top) &&
            pointerY <= Math.max(currentRect.bottom, nextRect.bottom);

          if (isInGapHorizontally && isInGapVertically && gapSize >= ZONE_CONFIG.GAP_THRESHOLD) {
            return { before: current, after: next };
          }
        }
      }
    }

    // Fallback: check all adjacent children (original logic for simple layouts)
    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i];
      const next = children[i + 1];

      const currentRect = getRect(current);
      const nextRect = getRect(next);

      if (orientation === "vertical") {
        // Vertical layout: check for horizontal gaps (space between vertically stacked items)
        const gapStart = currentRect.bottom;
        const gapEnd = nextRect.top;
        const gapSize = gapEnd - gapStart;

        // Check if pointer is within the gap boundaries
        const isInGapVertically = pointerY >= gapStart && pointerY <= gapEnd;
        const isInGapHorizontally =
          pointerX >= Math.min(currentRect.left, nextRect.left) &&
          pointerX <= Math.max(currentRect.right, nextRect.right);

        if (isInGapVertically && isInGapHorizontally && gapSize >= ZONE_CONFIG.GAP_THRESHOLD) {
          return { before: current, after: next };
        }
      } else {
        // Horizontal layout: check for vertical gaps (space between horizontally arranged items)
        const gapStart = currentRect.right;
        const gapEnd = nextRect.left;
        const gapSize = gapEnd - gapStart;

        // Check if pointer is within the gap boundaries
        const isInGapHorizontally = pointerX >= gapStart && pointerX <= gapEnd;
        const isInGapVertically =
          pointerY >= Math.min(currentRect.top, nextRect.top) &&
          pointerY <= Math.max(currentRect.bottom, nextRect.bottom);

        if (isInGapHorizontally && isInGapVertically && gapSize >= ZONE_CONFIG.GAP_THRESHOLD) {
          return { before: current, after: next };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * @FUNCTION_NAME detectParentEdgeProximity
 * @arguments { parentElement, pointerX, pointerY, parentOrientation }
 * @description
 * Detects if the pointer is near the edges of a parent container.
 * This enables suggesting placement at the parent level when dragging near container boundaries.
 * Useful for nested layouts where you want to add items at the parent level.
 *
 * Logic:
 * - Checks if pointer is within PARENT_EDGE_PROXIMITY (20px) of container edges
 * - For vertical layouts: checks top/bottom edges
 * - For horizontal layouts: checks left/right edges
 *
 * @param parentElement - The parent container element
 * @param pointerX - X coordinate of the pointer
 * @param pointerY - Y coordinate of the pointer
 * @param parentOrientation - Layout orientation of the parent
 * @returns 'start' if near beginning edge, 'end' if near ending edge, null otherwise
 */
function detectParentEdgeProximity(
  parentElement: HTMLElement,
  pointerX: number,
  pointerY: number,
  parentOrientation: "vertical" | "horizontal",
): "start" | "end" | null {
  try {
    const parentRect = getRect(parentElement);
    const threshold = ZONE_CONFIG.PARENT_EDGE_PROXIMITY;

    if (parentOrientation === "vertical") {
      // Check top and bottom edges for vertical layouts
      if (pointerY <= parentRect.top + threshold) {
        return "start";
      }
      if (pointerY >= parentRect.bottom - threshold) {
        return "end";
      }
    } else {
      // Check left and right edges for horizontal layouts
      if (pointerX <= parentRect.left + threshold) {
        return "start";
      }
      if (pointerX >= parentRect.right - threshold) {
        return "end";
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * @FUNCTION_NAME calculateElementZone
 * @arguments { element, pointerX, pointerY, orientation, canAcceptChild }
 * @description
 * Calculate which zone of an element the pointer is in.
 * Returns position (before/after/inside) and confidence score (0-1).
 *
 * Uses smart edge detection with dynamic sizing based on element dimensions.
 * Smaller elements get smaller edge zones, larger elements get larger zones.
 *
 * @param element - The target element
 * @param pointerX - X coordinate of the pointer
 * @param pointerY - Y coordinate of the pointer
 * @param orientation - Layout orientation of the element
 * @param canAcceptChild - Whether the element can accept children
 * @returns Object with position and confidence score
 */
function calculateElementZone(
  element: HTMLElement,
  pointerX: number,
  pointerY: number,
  canAcceptChild: boolean,
  orientation: "vertical" | "horizontal",
): { position: "before" | "after" | "inside"; confidence: number } {
  const rect = getRect(element);

  if (orientation === "vertical") {
    const relativeY = pointerY - rect.top;
    const relativePosition = relativeY / rect.height;
    const edgeZoneSize = calculateEdgeZoneSize(rect.height);
    const edgeZoneRatio = edgeZoneSize / rect.height;

    if (!canAcceptChild) {
      // 2-zone logic: only before/after
      if (relativePosition < 0.5) {
        return {
          position: "before",
          confidence: 1 - relativePosition * 2, // Higher confidence closer to top
        };
      } else {
        return {
          position: "after",
          confidence: (relativePosition - 0.5) * 2, // Higher confidence closer to bottom
        };
      }
    } else {
      // 3-zone logic with smart edge detection
      if (edgeZoneSize > 0 && relativePosition < edgeZoneRatio) {
        // Top edge zone
        return {
          position: "before",
          confidence: 1 - relativePosition / edgeZoneRatio,
        };
      } else if (edgeZoneSize > 0 && relativePosition > 1 - edgeZoneRatio) {
        // Bottom edge zone
        return {
          position: "after",
          confidence: (relativePosition - (1 - edgeZoneRatio)) / edgeZoneRatio,
        };
      } else {
        // Middle zone - inside
        const distanceFromCenter = Math.abs(relativePosition - 0.5);
        return {
          position: "inside",
          confidence: 1 - distanceFromCenter * 2, // Higher confidence at center
        };
      }
    }
  } else {
    // Horizontal orientation
    const relativeX = pointerX - rect.left;
    const relativePosition = relativeX / rect.width;
    const edgeZoneSize = calculateEdgeZoneSize(rect.width);
    const edgeZoneRatio = edgeZoneSize / rect.width;

    if (!canAcceptChild) {
      // 2-zone logic: only before/after
      if (relativePosition < 0.5) {
        return {
          position: "before",
          confidence: 1 - relativePosition * 2,
        };
      } else {
        return {
          position: "after",
          confidence: (relativePosition - 0.5) * 2,
        };
      }
    } else {
      // 3-zone logic with smart edge detection
      if (edgeZoneSize > 0 && relativePosition < edgeZoneRatio) {
        // Left edge zone
        return {
          position: "before",
          confidence: 1 - relativePosition / edgeZoneRatio,
        };
      } else if (edgeZoneSize > 0 && relativePosition > 1 - edgeZoneRatio) {
        // Right edge zone
        return {
          position: "after",
          confidence: (relativePosition - (1 - edgeZoneRatio)) / edgeZoneRatio,
        };
      } else {
        // Middle zone - inside
        const distanceFromCenter = Math.abs(relativePosition - 0.5);
        return {
          position: "inside",
          confidence: 1 - distanceFromCenter * 2,
        };
      }
    }
  }
}

/**
 * Main function to detect the best drop zone based on pointer position
 * This is the primary entry point for intelligent drop zone detection
 */
export function detectDropZone(
  targetElement: HTMLElement,
  pointerX: number,
  pointerY: number,
  draggedBlockType: string,
  iframeDoc: Document,
): DropZone | null {
  resetRectCache();

  const targetBlockId = targetElement.getAttribute("data-block-id");
  const targetBlockType = targetElement.getAttribute("data-block-type") || "Box";

  if (!targetBlockId) {
    return null;
  }

  // Get parent element and its properties
  let parentElement = targetElement.parentElement;
  while (parentElement && !parentElement.hasAttribute("data-block-id")) {
    parentElement = parentElement.parentElement;
  }

  const parentBlockId = targetBlockId === "canvas" ? targetBlockId : parentElement?.getAttribute("data-block-id");
  const parentOrientation = parentElement ? getOrientation(parentElement) : "vertical";
  const targetOrientation = getOrientation(targetElement);

  // Check if target is a leaf block - leaf blocks cannot accept children
  const isTargetLeafBlock = isLeafBlock(targetBlockType);

  // Check if target can accept the dragged block as a child
  // Leaf blocks are always treated as unable to accept children
  const canAcceptChild = !isTargetLeafBlock && canAcceptChildBlock(targetBlockType, draggedBlockType);

  const scrollTop = iframeDoc.defaultView?.scrollY || 0;
  const scrollLeft = iframeDoc.defaultView?.scrollX || 0;

  // Special handling for canvas (root container) with existing children
  // Position placeholder after the last child instead of at canvas bottom
  if (targetBlockId === "canvas" && hasChildBlocks(targetElement)) {
    const children = getChildBlocks(targetElement);
    const lastChild = children[children.length - 1];

    if (lastChild) {
      const lastChildRect = getRect(lastChild);
      const canvasRect = getRect(targetElement);
      const canvasStyle = getComputedStyleOf(targetElement);
      const canvasPaddingLeft = parseFloat(canvasStyle.paddingLeft) || 0;
      const canvasPaddingRight = parseFloat(canvasStyle.paddingRight) || 0;

      // Canvas is typically vertical, so show horizontal placeholder after last child
      const fullWidth = canvasRect.width - canvasPaddingLeft - canvasPaddingRight;
      const leftPosition = canvasRect.left + scrollLeft + canvasPaddingLeft;

      return {
        position: "after",
        placeholderOrientation: "horizontal",
        rect: {
          top: lastChildRect.bottom + scrollTop,
          left: leftPosition,
          width: fullWidth,
          height: 4,
        },
        targetElement: lastChild,
        targetBlockId: lastChild.getAttribute("data-block-id")!,
        targetParentId: "canvas",
        isEmpty: false,
        confidence: 1.0,
      };
    }
  }

  // Priority 1: Check for gap zones in the target (if it's a container and not a leaf block)
  if (canAcceptChild && !isTargetLeafBlock && hasChildBlocks(targetElement)) {
    const gapZone = detectGapZone(targetElement, pointerX, pointerY, targetOrientation);

    if (gapZone) {
      // Found a gap! Create a drop zone after the 'before' element
      const beforeRect = getRect(gapZone.before);
      const afterRect = getRect(gapZone.after);

      // Get parent (container) dimensions for full width/height
      const containerRect = getRect(targetElement);
      const containerStyle = getComputedStyleOf(targetElement);
      const containerPaddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
      const containerPaddingRight = parseFloat(containerStyle.paddingRight) || 0;

      // Get siblings in the same row for multi-row grid support
      const allChildren = getChildBlocks(targetElement);
      const siblingsInRow = getSiblingsInSameRow(allChildren, gapZone.before, targetOrientation);

      // Calculate max height of siblings in the same row
      let maxRowHeight = 0;
      siblingsInRow.forEach((sibling) => {
        const siblingRect = getRect(sibling);
        if (siblingRect.height > maxRowHeight) maxRowHeight = siblingRect.height;
      });

      if (targetOrientation === "vertical") {
        // Horizontal line in the gap - use parent's full width
        const fullWidth = containerRect.width - containerPaddingLeft - containerPaddingRight;
        const leftPosition = containerRect.left + scrollLeft + containerPaddingLeft;

        return {
          position: "after",
          placeholderOrientation: "horizontal",
          rect: {
            top: beforeRect.bottom + scrollTop,
            left: leftPosition,
            width: fullWidth,
            height: 4,
          },
          targetElement: gapZone.before,
          targetBlockId: gapZone.before.getAttribute("data-block-id")!,
          targetParentId: targetBlockId,
          isGapZone: true,
          confidence: 1.0, // High confidence for gap zones
        };
      } else {
        // Vertical line in the gap - use row height for multi-row grids
        // Position at the top of the current row, not the container top
        const rowTopPosition = beforeRect.top + scrollTop;
        const placeholderHeight = maxRowHeight > 0 ? maxRowHeight : Math.max(beforeRect.height, afterRect.height);

        return {
          position: "after",
          placeholderOrientation: "vertical",
          rect: {
            top: rowTopPosition,
            left: beforeRect.right + scrollLeft,
            width: 4,
            height: placeholderHeight,
          },
          targetElement: gapZone.before,
          targetBlockId: gapZone.before.getAttribute("data-block-id")!,
          targetParentId: targetBlockId,
          isGapZone: true,
          confidence: 1.0,
        };
      }
    }
  }

  // Priority 2: Check if pointer is near parent edges (for nested layouts)
  if (parentElement && parentBlockId && parentBlockId !== "canvas") {
    const parentEdge = detectParentEdgeProximity(parentElement, pointerX, pointerY, parentOrientation);

    if (parentEdge) {
      // Pointer is near parent edge - suggest placement at parent level
      const parentRect = getRect(parentElement);
      const parentStyle = getComputedStyleOf(parentElement);
      const parentPaddingLeft = parseFloat(parentStyle.paddingLeft) || 0;
      const parentPaddingRight = parseFloat(parentStyle.paddingRight) || 0;
      const parentPaddingTop = parseFloat(parentStyle.paddingTop) || 0;
      const parentPaddingBottom = parseFloat(parentStyle.paddingBottom) || 0;

      const scrollTop = iframeDoc.defaultView?.scrollY || 0;
      const scrollLeft = iframeDoc.defaultView?.scrollX || 0;

      const placeholderOrientation = parentOrientation === "vertical" ? "horizontal" : "vertical";

      // Get max sibling dimensions for better grid layout support
      const maxSiblingDimensions = getMaxSiblingDimensions(parentElement);

      if (parentEdge === "start") {
        // Place before first child
        const firstChild = getChildBlocks(parentElement)[0];
        if (firstChild) {
          const firstChildRect = getRect(firstChild);

          if (parentOrientation === "vertical") {
            // Horizontal placeholder - use parent's full width
            const fullWidth = parentRect.width - parentPaddingLeft - parentPaddingRight;
            const leftPosition = parentRect.left + scrollLeft + parentPaddingLeft;

            return {
              position: "before",
              placeholderOrientation,
              rect: {
                top: firstChildRect.top + scrollTop - 2,
                left: leftPosition,
                width: fullWidth,
                height: 4,
              },
              targetElement: firstChild,
              targetBlockId: firstChild.getAttribute("data-block-id")!,
              targetParentId: parentBlockId,
              confidence: 0.9,
            };
          } else {
            // Vertical placeholder - use max sibling height for horizontal layouts
            const topPosition = parentRect.top + scrollTop + parentPaddingTop;
            const placeholderHeight =
              maxSiblingDimensions.maxHeight > 0
                ? maxSiblingDimensions.maxHeight
                : parentRect.height - parentPaddingTop - parentPaddingBottom;

            return {
              position: "before",
              placeholderOrientation,
              rect: {
                top: topPosition,
                left: firstChildRect.left + scrollLeft - 2,
                width: 4,
                height: placeholderHeight,
              },
              targetElement: firstChild,
              targetBlockId: firstChild.getAttribute("data-block-id")!,
              targetParentId: parentBlockId,
              confidence: 0.9,
            };
          }
        }
      } else {
        // Place after last child
        const children = getChildBlocks(parentElement);
        const lastChild = children[children.length - 1];
        if (lastChild) {
          const lastChildRect = getRect(lastChild);

          if (parentOrientation === "vertical") {
            // Horizontal placeholder - use parent's full width
            const fullWidth = parentRect.width - parentPaddingLeft - parentPaddingRight;
            const leftPosition = parentRect.left + scrollLeft + parentPaddingLeft;

            return {
              position: "after",
              placeholderOrientation,
              rect: {
                top: lastChildRect.bottom + scrollTop - 2,
                left: leftPosition,
                width: fullWidth,
                height: 4,
              },
              targetElement: lastChild,
              targetBlockId: lastChild.getAttribute("data-block-id")!,
              targetParentId: parentBlockId,
              confidence: 0.9,
            };
          } else {
            // Vertical placeholder - use max sibling height for horizontal layouts
            const topPosition = parentRect.top + scrollTop + parentPaddingTop;
            const placeholderHeight =
              maxSiblingDimensions.maxHeight > 0
                ? maxSiblingDimensions.maxHeight
                : parentRect.height - parentPaddingTop - parentPaddingBottom;

            return {
              position: "after",
              placeholderOrientation,
              rect: {
                top: topPosition,
                left: lastChildRect.right + scrollLeft - 2,
                width: 4,
                height: placeholderHeight,
              },
              targetElement: lastChild,
              targetBlockId: lastChild.getAttribute("data-block-id")!,
              targetParentId: parentBlockId,
              confidence: 0.9,
            };
          }
        }
      }
    }
  }

  // Priority 3: Calculate zone based on pointer position within target element
  let zoneResult = calculateElementZone(targetElement, pointerX, pointerY, canAcceptChild, parentOrientation);

  // Safeguard: If target is a leaf block and position is "inside", force it to before/after
  if (isTargetLeafBlock && zoneResult.position === "inside") {
    const rect = getRect(targetElement);
    if (parentOrientation === "vertical") {
      const relativeY = pointerY - rect.top;
      const relativePosition = relativeY / rect.height;
      zoneResult = {
        position: relativePosition < 0.5 ? "before" : "after",
        confidence: zoneResult.confidence,
      };
    } else {
      const relativeX = pointerX - rect.left;
      const relativePosition = relativeX / rect.width;
      zoneResult = {
        position: relativePosition < 0.5 ? "before" : "after",
        confidence: zoneResult.confidence,
      };
    }
  }

  // Determine placeholder orientation
  let placeholderOrientation: "vertical" | "horizontal";
  if (zoneResult.position === "inside") {
    // Inside uses target's own orientation
    placeholderOrientation = targetOrientation === "vertical" ? "horizontal" : "vertical";
  } else {
    // Before/after uses opposite of parent orientation
    placeholderOrientation = parentOrientation === "vertical" ? "horizontal" : "vertical";
  }

  // Calculate placeholder rectangle with parent element for proper sizing
  const rect = calculatePlaceholderRect(
    targetElement,
    parentElement,
    zoneResult.position,
    placeholderOrientation,
    iframeDoc,
  );

  // Determine the correct parent ID based on position
  // - For "inside": parent is the target element itself
  // - For "before"/"after": parent is the parent of the target element
  const correctParentId = zoneResult.position === "inside" ? targetBlockId : parentBlockId;

  return {
    position: zoneResult.position,
    placeholderOrientation,
    rect,
    targetElement,
    targetBlockId,
    targetParentId: correctParentId ?? "",
    isEmpty: zoneResult.position === "inside" && !hasChildBlocks(targetElement),
    confidence: zoneResult.confidence,
  };
}

/**
 * @FUNCTION_NAME findClosestSiblingInRow
 * @description
 * Finds the closest sibling element that is in the same visual row/column as the pointer.
 * This is crucial for multi-row grids and wrapped flex layouts where DOM order
 * doesn't match visual layout.
 *
 * @param children - Array of sibling elements
 * @param pointerX - X coordinate of the pointer
 * @param pointerY - Y coordinate of the pointer
 * @param orientation - Layout orientation
 * @returns The closest sibling element in the same row, or null
 */
function findClosestSiblingInRow(
  children: HTMLElement[],
  pointerX: number,
  pointerY: number,
  orientation: "vertical" | "horizontal",
): HTMLElement | null {
  if (children.length === 0) return null;

  // Find all siblings that are in the same row/column as the pointer
  const siblingsInSameRow = children.filter((child) => {
    const rect = getRect(child);

    if (orientation === "vertical") {
      // For vertical layouts, check if pointer Y is within the element's vertical range
      return pointerY >= rect.top && pointerY <= rect.bottom;
    } else {
      // For horizontal layouts, check if pointer X is within the element's horizontal range
      return pointerX >= rect.left && pointerX <= rect.right;
    }
  });

  if (siblingsInSameRow.length === 0) {
    // If no exact match, find the row that contains the pointer
    const rowsMap = new Map<number, HTMLElement[]>();

    children.forEach((child) => {
      const rect = getRect(child);
      const rowKey = orientation === "vertical" ? Math.round(rect.top) : Math.round(rect.left);

      if (!rowsMap.has(rowKey)) {
        rowsMap.set(rowKey, []);
      }
      rowsMap.get(rowKey)!.push(child);
    });

    // Find the closest row to the pointer
    let closestRow: HTMLElement[] | null = null;
    let minDistance = Infinity;

    rowsMap.forEach((row: HTMLElement[], rowKey: number) => {
      const distance = orientation === "vertical" ? Math.abs(pointerY - rowKey) : Math.abs(pointerX - rowKey);

      if (distance < minDistance) {
        minDistance = distance;
        closestRow = row;
      }
    });

    if (closestRow) {
      siblingsInSameRow.push(closestRow);
    }
  }

  if (siblingsInSameRow.length === 0) return null;

  // Find the closest sibling based on distance
  let closest = siblingsInSameRow[0];
  let minDistance = Infinity;

  siblingsInSameRow.forEach((child) => {
    const rect = getRect(child);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.sqrt(Math.pow(pointerX - centerX, 2) + Math.pow(pointerY - centerY, 2));

    if (distance < minDistance) {
      minDistance = distance;
      closest = child;
    }
  });

  return closest;
}

/**
 * @FUNCTION_NAME getMaxSiblingDimensions
 * @description
 * Calculates the maximum width and height among all siblings in a container.
 * Used to size the drop indicator to match the largest sibling for better visual clarity.
 *
 * @param parentElement - The parent container element
 * @returns Object with maxWidth and maxHeight of siblings
 */
function getMaxSiblingDimensions(parentElement: HTMLElement): {
  maxWidth: number;
  maxHeight: number;
} {
  const children = getChildBlocks(parentElement);

  if (children.length === 0) {
    return { maxWidth: 0, maxHeight: 0 };
  }

  let maxWidth = 0;
  let maxHeight = 0;

  children.forEach((child) => {
    const rect = getRect(child);
    if (rect.width > maxWidth) maxWidth = rect.width;
    if (rect.height > maxHeight) maxHeight = rect.height;
  });

  return { maxWidth, maxHeight };
}

/**
 * @FUNCTION_NAME getSiblingsInSameRow
 * @description
 * Gets all sibling elements that are in the same visual row as a target element.
 * Essential for calculating proper drop indicator dimensions in multi-row layouts.
 *
 * @param children - Array of sibling elements
 * @param targetElement - The reference element
 * @param orientation - Layout orientation
 * @returns Array of siblings in the same row
 */
function getSiblingsInSameRow(
  children: HTMLElement[],
  targetElement: HTMLElement,
  orientation: "vertical" | "horizontal",
): HTMLElement[] {
  const targetRect = getRect(targetElement);
  const tolerance = 5; // pixels of tolerance for row detection

  return children.filter((child) => {
    const rect = getRect(child);

    if (orientation === "vertical") {
      // Same row if tops are roughly aligned (within tolerance)
      return Math.abs(rect.top - targetRect.top) <= tolerance;
    } else {
      // Same column if lefts are roughly aligned
      return Math.abs(rect.left - targetRect.left) <= tolerance;
    }
  });
}

/**
 * @FUNCTION_NAME calculatePlaceholderRect
 * @arguments { element, parentElement, position, placeholderOrientation, iframeDoc }
 * @description
 * Calculates the exact rectangle dimensions for the placeholder.
 *
 * Key Rules:
 * - Horizontal placeholders: Use parent's full width OR max sibling height (for grid layouts)
 * - Vertical placeholders: Use parent's full height OR max sibling width (for grid layouts)
 * - Empty containers: Show full container area
 * - Non-empty containers: Show insertion line at the end
 * - For before/after positions: Use max sibling dimensions instead of parent's full size
 *
 * @param element - The target element
 * @param parentElement - The parent element (for full width/height)
 * @param position - Where to place the placeholder
 * @param placeholderOrientation - Orientation of the placeholder line
 * @param iframeDoc - The iframe document for scroll calculations
 * @returns Rectangle with top, left, width, height
 */
function calculatePlaceholderRect(
  element: HTMLElement,
  parentElement: HTMLElement | null,
  position: "before" | "after" | "inside",
  placeholderOrientation: "vertical" | "horizontal",
  iframeDoc: Document,
): { top: number; left: number; width: number; height: number } {
  const rect = getRect(element);
  const computedStyle = getComputedStyleOf(element);

  const scrollTop = iframeDoc.defaultView?.scrollY || 0;
  const scrollLeft = iframeDoc.defaultView?.scrollX || 0;

  const marginTop = parseFloat(computedStyle.marginTop) || 0;
  const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
  const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
  const marginRight = parseFloat(computedStyle.marginRight) || 0;
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;

  // Use parent element dimensions for full width/height
  const parentRect = parentElement ? getRect(parentElement) : undefined;
  const parentPaddingLeft = parentElement ? parseFloat(getComputedStyleOf(parentElement).paddingLeft) || 0 : 0;
  const parentPaddingRight = parentElement ? parseFloat(getComputedStyleOf(parentElement).paddingRight) || 0 : 0;
  const parentPaddingTop = parentElement ? parseFloat(getComputedStyleOf(parentElement).paddingTop) || 0 : 0;
  const parentPaddingBottom = parentElement ? parseFloat(getComputedStyleOf(parentElement).paddingBottom) || 0 : 0;

  // Get max sibling dimensions for better grid layout support
  const maxSiblingDimensions = parentElement ? getMaxSiblingDimensions(parentElement) : { maxWidth: 0, maxHeight: 0 };
  const parentOrientation = parentElement ? getOrientation(parentElement) : "vertical";

  // Get siblings in the same row for multi-row grid support
  const allSiblings = parentElement ? getChildBlocks(parentElement) : [];
  const siblingsInRow = getSiblingsInSameRow(allSiblings, element, parentOrientation);

  // Calculate max height/width of siblings in the same row
  let maxRowHeight = 0;
  let maxRowWidth = 0;
  siblingsInRow.forEach((sibling) => {
    const siblingRect = getRect(sibling);
    if (siblingRect.height > maxRowHeight) maxRowHeight = siblingRect.height;
    if (siblingRect.width > maxRowWidth) maxRowWidth = siblingRect.width;
  });

  if (position === "before") {
    if (placeholderOrientation === "horizontal") {
      // Horizontal line above element - use parent's full width
      const fullWidth = parentRect ? parentRect.width - parentPaddingLeft - parentPaddingRight : rect.width;
      const leftPosition = parentRect ? parentRect.left + scrollLeft + parentPaddingLeft : rect.left + scrollLeft;

      return {
        top: rect.top + scrollTop - marginTop - 2,
        left: leftPosition,
        width: fullWidth,
        height: 4,
      };
    } else {
      // Vertical line before element - use actual row height for multi-row grids
      // Position at the top of the current row, not the parent top
      const rowTopPosition = rect.top + scrollTop;

      // For horizontal parent layouts (grids/flex), use the height of siblings in the same row
      const placeholderHeight =
        parentOrientation === "horizontal" && maxRowHeight > 0
          ? maxRowHeight
          : maxSiblingDimensions.maxHeight > 0
            ? maxSiblingDimensions.maxHeight
            : parentRect
              ? parentRect.height - parentPaddingTop - parentPaddingBottom
              : rect.height;

      return {
        top: rowTopPosition,
        left: rect.left + scrollLeft - marginLeft - 2,
        width: 4,
        height: placeholderHeight,
      };
    }
  } else if (position === "after") {
    if (placeholderOrientation === "horizontal") {
      // Horizontal line below element - use parent's full width
      const fullWidth = parentRect ? parentRect.width - parentPaddingLeft - parentPaddingRight : rect.width;
      const leftPosition = parentRect ? parentRect.left + scrollLeft + parentPaddingLeft : rect.left + scrollLeft;

      return {
        top: rect.bottom + scrollTop + marginBottom - 2,
        left: leftPosition,
        width: fullWidth,
        height: 4,
      };
    } else {
      // Vertical line after element - use actual row height for multi-row grids
      // Position at the top of the current row, not the parent top
      const rowTopPosition = rect.top + scrollTop;

      // For horizontal parent layouts (grids/flex), use the height of siblings in the same row
      const placeholderHeight =
        parentOrientation === "horizontal" && maxRowHeight > 0
          ? maxRowHeight
          : maxSiblingDimensions.maxHeight > 0
            ? maxSiblingDimensions.maxHeight
            : parentRect
              ? parentRect.height - parentPaddingTop - parentPaddingBottom
              : rect.height;

      return {
        top: rowTopPosition,
        left: rect.right + scrollLeft + marginRight - 2,
        width: 4,
        height: placeholderHeight,
      };
    }
  } else {
    // Inside position
    const isEmpty = !hasChildBlocks(element);

    if (isEmpty) {
      // Empty container: show full container highlight
      return {
        top: rect.top + scrollTop + paddingTop,
        left: rect.left + scrollLeft + paddingLeft,
        width: rect.width - paddingLeft - paddingRight,
        height: Math.max(rect.height - paddingTop - paddingBottom, 20),
      };
    } else {
      // Container with children: show insertion line at the end
      const targetOrientation = getOrientation(element);

      if (targetOrientation === "vertical") {
        // Horizontal line at bottom
        return {
          top: rect.bottom + scrollTop - paddingBottom - 2,
          left: rect.left + scrollLeft + paddingLeft,
          width: rect.width - paddingLeft - paddingRight,
          height: 4,
        };
      } else {
        // Vertical line at right
        return {
          top: rect.top + scrollTop + paddingTop,
          left: rect.right + scrollLeft - paddingRight - 2,
          width: 4,
          height: rect.height - paddingTop - paddingBottom,
        };
      }
    }
  }
}

/**
 * Find the best drop zone from multiple candidates
 * Useful when pointer could be in multiple zones
 */
export function selectBestDropZone(zones: DropZone[]): DropZone | null {
  if (zones.length === 0) return null;
  if (zones.length === 1) return zones[0];

  // Sort by confidence (highest first)
  const sorted = [...zones].sort((a, b) => b.confidence - a.confidence);

  // Prefer gap zones if available
  const gapZone = sorted.find((z) => z.isGapZone);
  if (gapZone && gapZone.confidence > 0.7) {
    return gapZone;
  }

  // Otherwise return highest confidence
  return sorted[0];
}
