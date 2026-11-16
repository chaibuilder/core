import find from "lodash-es/find";
import filter from "lodash-es/filter";
import includes from "lodash-es/includes";
import isEmpty from "lodash-es/isEmpty";
import {
  canAcceptInto,
  canBeNestedInside,
  getBlockDepth,
  getBlockMaxDepth,
} from "~/builder/core/functions/block-helpers";
import { ChaiBlock } from "~/types/common";

export { insertBlocksAtPosition } from "~/builder/hooks/history/insert-block-at-position";

const fitsMaxDepth = (parentId: string, allBlocks: ChaiBlock[], maxDepth: number) =>
  maxDepth < 0 || getBlockDepth(parentId, allBlocks) + 1 <= maxDepth;

/**
 * Resolve the nearest valid parent and insertion position for a new block.
 * Callers that accept an explicit parent must validate that id exists first;
 * this helper intentionally walks upward only through known blocks.
 *
 * `maxDepth` overrides the child type's registered `maxDepth` — library blocks
 * pass it because their root block type (a Box) says nothing about placement.
 * A depth-limited block that had to climb is always placed right after the
 * ancestor it climbed out of, replacing any provided position: that position
 * was meant for a parent the block did not end up in.
 */
export const getParentAndPosition = (
  childType: string,
  allBlocks: ChaiBlock[],
  selectedBlockIds: string[],
  providedParentId?: string | null,
  providedPosition?: number,
  maxDepth?: number,
): { parentBlockId: string | undefined; insertPosition: number | undefined } => {
  const depthLimit = maxDepth ?? getBlockMaxDepth(childType);
  const placeAfterClimbedAncestor = providedPosition === undefined || depthLimit >= 0;
  let insertPosition = providedPosition;
  let currentTargetId: string | undefined = providedParentId || selectedBlockIds[0];
  let parentBlockId: string | undefined;
  let previousCandidateId: string | null = null;

  while (currentTargetId) {
    const candidateParent = allBlocks.find((block) => block._id === currentTargetId);
    if (!candidateParent) break;

    if (
      canAcceptInto(candidateParent, childType, allBlocks) &&
      canBeNestedInside(candidateParent._type, childType) &&
      // A slot takes whatever its owner's accept rule allows at any depth: the owner made room for it.
      (fitsMaxDepth(candidateParent._id, allBlocks, depthLimit) || candidateParent._type === "ChaiSlot")
    ) {
      parentBlockId = candidateParent._id;
      break;
    }

    previousCandidateId = currentTargetId;
    currentTargetId = candidateParent._parent || undefined;
  }

  if (previousCandidateId && placeAfterClimbedAncestor) {
    const siblings = allBlocks.filter((block) => (parentBlockId ? block._parent === parentBlockId : !block._parent));
    const siblingIndex = siblings.findIndex((block) => block._id === previousCandidateId);
    if (siblingIndex !== -1) insertPosition = siblingIndex + 1;
  }

  return { parentBlockId, insertPosition };
};

/**
 * Pure block-tree operations shared by the builder hooks (which wrap them with
 * the jotai store + undo history) and the MCP server tools (which apply them to
 * draft blocks read straight from the database). Keeping them here — free of
 * react/jotai imports — lets the server route use them without dragging the
 * whole builder runtime into its bundle.
 */

/**
 * Collects all descendant block IDs for a given parent ID.
 *
 * Builds a parent→children index once and walks it iteratively: rescanning the
 * whole array per recursion level was O(n²) on large pages, and the recursion
 * could blow the stack on deeply nested trees.
 */
const getAllDescendantIds = (blocks: ChaiBlock[], parentId: string): string[] => {
  const childrenByParent = new Map<string, string[]>();
  for (const block of blocks) {
    if (!block._parent) continue;
    const siblings = childrenByParent.get(block._parent);
    if (siblings) siblings.push(block._id);
    else childrenByParent.set(block._parent, [block._id]);
  }

  const descendantIds: string[] = [];
  const seen = new Set<string>([parentId]);
  // Index-based cursor rather than queue.shift(): shift() reindexes the array
  // on every call, which would make this walk quadratic on large trees.
  const queue = [parentId];
  for (let i = 0; i < queue.length; i++) {
    for (const childId of childrenByParent.get(queue[i]) ?? []) {
      if (seen.has(childId)) continue; // defensive: tolerate a cyclic _parent
      seen.add(childId);
      descendantIds.push(childId);
      queue.push(childId);
    }
  }
  return descendantIds;
};

/**
 * Replace `blockId` (and its whole subtree) with `replacementBlocks`, inserting
 * them at the removed block's position and reparenting the replacement roots to
 * the removed block's parent.
 */
export const replaceBlock = (
  blocks: ChaiBlock[],
  blockId: string,
  replacementBlocks: ChaiBlock[],
): ChaiBlock[] => {
  const blockToReplace = find(blocks, { _id: blockId });
  if (!blockToReplace) return blocks;

  const blockIndex = blocks.findIndex((block) => block._id === blockId);

  const descendantIds = getAllDescendantIds(blocks, blockId);
  const idsToRemove = new Set([blockId, ...descendantIds]);

  const blocksWithoutRemoved = blocks.filter((block) => !idsToRemove.has(block._id));

  const replacementBlockIds = new Set(replacementBlocks.map((b) => b._id));
  const updatedReplacementBlocks = replacementBlocks.map((block) => {
    const isRootLevel = !block._parent || !replacementBlockIds.has(block._parent);
    return isRootLevel ? { ...block, _parent: blockToReplace._parent } : block;
  });

  return [
    ...blocksWithoutRemoved.slice(0, blockIndex),
    ...updatedReplacementBlocks,
    ...blocksWithoutRemoved.slice(blockIndex),
  ];
};

/**
 * Remove `blockIds` and all their descendants. When a removed block's parent is
 * left with a single remaining Text child, the parent absorbs that Text block's
 * content (and content-* language props) — mirroring how content collapses back
 * into a leaf block in the editor.
 */
export const removeNestedBlocks = (blocks: ChaiBlock[], blockIds: Array<string>): ChaiBlock[] => {
  let modifiedBlocks = [...blocks];
  const additionalBlocksToRemove: string[] = [];

  blockIds.forEach((blockId) => {
    const blockToRemove = modifiedBlocks.find((block) => block._id === blockId);
    if (!blockToRemove || !blockToRemove._parent) return;

    const parentId = blockToRemove._parent;
    const parentChildren = modifiedBlocks.filter((block) => block._parent === parentId);

    if (parentChildren.length === 2) {
      const otherChild = parentChildren.find((child) => child._id !== blockId);

      if (otherChild && otherChild._type === "Text") {
        const parentBlock = modifiedBlocks.find((block) => block._id === parentId);

        if (parentBlock && "content" in parentBlock) {
          modifiedBlocks = modifiedBlocks.map((block) => {
            if (block._id === parentId) {
              const updatedBlock = { ...block, content: otherChild.content };
              Object.keys(otherChild).forEach((key) => {
                if (key.startsWith("content-")) {
                  (updatedBlock as any)[key] = otherChild[key];
                }
              });
              return updatedBlock;
            }
            return block;
          });

          additionalBlocksToRemove.push(otherChild._id);
        }
      }
    }
  });

  const allBlocksToRemove = [...blockIds, ...additionalBlocksToRemove];

  const _blockIds: Array<string> = [];
  const _blocks = filter(modifiedBlocks, (block: ChaiBlock) => {
    if (includes(allBlocksToRemove, block._id) || includes(allBlocksToRemove, block._parent)) {
      _blockIds.push(block._id);
      return false;
    }
    return true;
  });

  if (!isEmpty(_blockIds)) return removeNestedBlocks(_blocks, _blockIds);
  return _blocks;
};
