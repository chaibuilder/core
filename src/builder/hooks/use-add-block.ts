import { useSetAtom } from "jotai";
import { filter, first, forEach, has } from "lodash-es";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { generateUUID } from "~/builder/core/functions/common-functions";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { getBlockDefaultProps } from "~/registry";
import { ChaiBlock, ChaiCoreBlock } from "~/types/common";
import { getParentAndPosition } from "~/utils/blocks-tree-ops";

export { getParentAndPosition } from "~/utils/blocks-tree-ops";

// Delay before selecting a newly added block to ensure the block is rendered in the DOM
// and the state has been updated before attempting to highlight it
const BLOCK_SELECTION_DELAY_MS = 100;

type AddBlocks = {
  addCoreBlock: any;
  addPredefinedBlock: any;
};

export const useAddBlock = (): AddBlocks => {
  const setSelected = useSetAtom(selectedBlockIdsAtom);
  const { addBlocks } = useBlocksStoreUndoableActions();

  const getParentAndPositionWithContext = useCallback(
    (childType: string, providedParentId?: string | null, providedPosition?: number, maxDepth?: number) => {
      // PERF: read on-demand via the store — no render-time subscription. This
      // hook mounts under EVERY canvas block (useBlockDrop -> useAddBlock), so
      // subscribing to the blocks array here re-rendered every block on every
      // edit, and subscribing to the selection re-rendered every block on every
      // click (measured: canvas-render-bench.test.tsx). Reading at call time
      // also uses the freshest state at the moment the block is added.
      const allBlocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
      const selectedBlockIds = builderStore.get(selectedBlockIdsAtom) as string[];
      return getParentAndPosition(childType, allBlocks, selectedBlockIds, providedParentId, providedPosition, maxDepth);
    },
    [],
  );

  const addPredefinedBlock = useCallback(
    (blocks: ChaiBlock[], parentId?: string, position?: number, options?: { maxDepth?: number }) => {
      for (let i = 0; i < blocks.length; i++) {
        const { _id } = blocks[i];

        blocks[i]._id = generateUUID();
        const children = filter(blocks, { _parent: _id });
        for (let j = 0; j < children.length; j++) {
          children[j]._parent = blocks[i]._id;
        }
      }
      const block = first(blocks)!;

      const { parentBlockId, insertPosition } = getParentAndPositionWithContext(
        block._type,
        parentId,
        position,
        options?.maxDepth,
      );

      blocks[0]._parent = parentBlockId;
      forEach(blocks, (b) => {
        if (!b?._parent) b._parent = parentBlockId;
      });

      addBlocks(blocks, parentBlockId, insertPosition);
      setSelected([block._id]);
      return block;
    },
    [addBlocks, getParentAndPositionWithContext, setSelected],
  );

  const addCoreBlock = useCallback(
    (coreBlock: ChaiCoreBlock, parentId?: string | null, position?: number) => {
      if (has(coreBlock, "blocks")) {
        const blocks = coreBlock.blocks as ChaiBlock[];
        return addPredefinedBlock(blocks, parentId ?? undefined, position);
      }

      const blockId = generateUUID();
      const props: { [key: string]: any } = getBlockDefaultProps(coreBlock.type);

      const newBlock: ChaiBlock = {
        _type: coreBlock.type,
        _id: blockId,
        ...props,
        ...(has(coreBlock, "_name") && { _name: coreBlock._name }),
        ...(has(coreBlock, "partialBlockId") && {
          partialBlockId: coreBlock.partialBlockId,
        }),
      };

      const { parentBlockId, insertPosition } = getParentAndPositionWithContext(newBlock._type, parentId, position);

      newBlock._parent = parentBlockId;
      const newBlocks: ChaiBlock[] = [newBlock];

      addBlocks(newBlocks, parentBlockId, insertPosition);
      setTimeout(() => setSelected([newBlock._id]), BLOCK_SELECTION_DELAY_MS);
      return newBlock;
    },
    [addBlocks, addPredefinedBlock, getParentAndPositionWithContext, setSelected],
  );

  return { addCoreBlock, addPredefinedBlock };
};
