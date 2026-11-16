import { each, filter, get, isString } from "lodash-es";
import { useCallback } from "react";
import { canDuplicateBlocks } from "~/builder/core/functions/block-helpers";
import { getDuplicatedBlocks } from "~/builder/core/functions/blocks-fn";
import {
  useBlocksStore,
  useBlocksStoreUndoableActions,
} from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { ChaiBlock } from "~/types/common";

/**
 * useDuplicateBlock
 */
export const useDuplicateBlocks = () => {
  const [presentBlocks] = useBlocksStore();
  const [, setSelected] = useSelectedBlockIds();
  const { addBlocks } = useBlocksStoreUndoableActions();

  return useCallback(
    (blockIds: string[], parentId: string | null = null) => {
      if (!canDuplicateBlocks(blockIds, presentBlocks)) return;
      const newBlockIds: string[] = [];
      each(blockIds, (blockId: string) => {
        const block = presentBlocks.find((block) => block._id === blockId) as ChaiBlock;
        if (!parentId) {
          // use the parent of the same block. Can be a falsy value. null undefined etc.
          parentId = block?._parent ?? null;
        } else if (parentId === "root") {
          parentId = null;
        }
        // get sibling blocks
        const siblingBlocks = filter(presentBlocks, (_block: ChaiBlock) =>
          isString(parentId) ? _block._parent === parentId : !_block._parent,
        );
        const blockPosition = siblingBlocks.indexOf(block);
        const newBlockPosition = blockPosition + 1;
        const newBlocks = getDuplicatedBlocks(presentBlocks, blockId, parentId);
        addBlocks(newBlocks, parentId ?? undefined, newBlockPosition);
        newBlockIds.push(get(newBlocks, "0._id", ""));
      });
      setSelected(newBlockIds);
    },
    [addBlocks, presentBlocks, setSelected],
  );
};
