import { useSetAtom } from "jotai";
import { filter, find, first, forEach, has } from "lodash-es";
import { t } from "i18next";
import { createContext, useCallback, useContext } from "react";
import { toast } from "sonner";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { canDeleteBlock } from "~/builder/core/functions/block-helpers";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { getChaiBlockDefaultProps } from "~/registry";
import { ChaiBlock, ChaiCoreBlock } from "~/types/common";
import { canReplaceWith, getParentAndPosition, replaceBlock } from "~/utils/blocks-tree-ops";

export { getParentAndPosition } from "~/utils/blocks-tree-ops";

// Delay before selecting a newly added block to ensure the block is rendered in the DOM
// and the state has been updated before attempting to highlight it
const BLOCK_SELECTION_DELAY_MS = 100;

// Block the Add Blocks dialog replaces; only adds made inside the dialog see it.
export const ReplaceBlockIdContext = createContext<string | null>(null);

type AddBlocks = {
  addCoreBlock: any;
  addPredefinedBlock: any;
};

export const useAddBlock = (): AddBlocks => {
  const setSelected = useSetAtom(selectedBlockIdsAtom);
  const { addBlocks, setNewBlocks } = useBlocksStoreUndoableActions();
  const replaceId = useContext(ReplaceBlockIdContext);

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

  // Swaps the pending replace target (and its children) for the new blocks in one undo step, otherwise adds.
  // Returns false when the picked block may not sit in the replaced block's place.
  const insertBlocks = useCallback(
    (newBlocks: ChaiBlock[], parentBlockId?: string, insertPosition?: number, maxDepth?: number) => {
      const allBlocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
      const target = replaceId ? find(allBlocks, { _id: replaceId }) : undefined;
      if (!target) {
        addBlocks(newBlocks, parentBlockId, insertPosition);
        return true;
      }
      const ids = new Set(newBlocks.map((b) => b._id));
      const roots = newBlocks.filter((b) => !b._parent || !ids.has(b._parent));
      const fits =
        canDeleteBlock(target) && roots.every((b) => canReplaceWith(target._id, b._type, allBlocks, maxDepth));
      if (!fits) {
        toast.error(t("This block can't replace the selected block here."));
        return false;
      }
      setNewBlocks(replaceBlock(allBlocks, target._id, newBlocks));
      return true;
    },
    [addBlocks, setNewBlocks, replaceId],
  );

  const addPredefinedBlock = useCallback(
    (blocks: ChaiBlock[], parentId?: string, position?: number, options?: { maxDepth?: number }) => {
      for (let i = 0; i < blocks.length; i++) {
        const { _id } = blocks[i];

        blocks[i]._id = generateUuid();
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

      if (!insertBlocks(blocks, parentBlockId, insertPosition, options?.maxDepth)) return undefined;
      setSelected([block._id]);
      return block;
    },
    [insertBlocks, getParentAndPositionWithContext, setSelected],
  );

  const addCoreBlock = useCallback(
    (coreBlock: ChaiCoreBlock, parentId?: string | null, position?: number) => {
      if (has(coreBlock, "blocks")) {
        const blocks = coreBlock.blocks as ChaiBlock[];
        return addPredefinedBlock(blocks, parentId ?? undefined, position);
      }

      const blockId = generateUuid();
      const props: { [key: string]: any } = getChaiBlockDefaultProps(coreBlock.type);

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

      if (!insertBlocks(newBlocks, parentBlockId, insertPosition)) return undefined;
      setTimeout(() => setSelected([newBlock._id]), BLOCK_SELECTION_DELAY_MS);
      return newBlock;
    },
    [insertBlocks, addPredefinedBlock, getParentAndPositionWithContext, setSelected],
  );

  return { addCoreBlock, addPredefinedBlock };
};
