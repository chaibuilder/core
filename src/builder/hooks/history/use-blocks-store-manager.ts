import { useSetAtom } from "jotai";
import { each, find, omit } from "lodash-es";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { useIncrementActionsCount } from "~/builder/core/components/use-auto-save";
import { insertBlocksAtPosition } from "~/builder/hooks/history/insert-block-at-position";
import { moveBlocksWithChildren } from "~/builder/hooks/history/move-blocks-with-children";
import { useBroadcastChannel } from "~/builder/hooks/use-broadcast-channel";
import { useCheckStructure } from "~/builder/hooks/use-check-structure";
import { removeNestedBlocks } from "~/builder/hooks/use-remove-blocks";
import { useUpdateBlockAtom } from "~/builder/hooks/use-update-block-atom";
import { ChaiBlock } from "~/types/common";

export const useBlocksStoreManager = () => {
  // PERF: setter-only — subscribing here would re-render every consumer of the
  // update hooks (every canvas block, outline node, settings form) on each change
  const setBlocks = useSetAtom(presentBlocksAtom);
  const { postMessage } = useBroadcastChannel();
  const updateBlockAtom = useUpdateBlockAtom();
  const runValidation = useCheckStructure();
  const incrementActionsCount = useIncrementActionsCount();
  return {
    setNewBlocks: (newBlocks: ChaiBlock[]) => {
      setBlocks(newBlocks);
      postMessage({ type: "blocks-updated", blocks: newBlocks });
      // Deletes come through here, so re-check the page like the other edits do.
      runValidation();
    },
    addBlocks: (newBlocks: ChaiBlock[], parent?: string, position?: number) => {
      setBlocks((prevBlocks) => {
        const blocks = insertBlocksAtPosition(prevBlocks, newBlocks, parent, position);
        postMessage({ type: "blocks-updated", blocks });
        runValidation();
        incrementActionsCount();
        return blocks;
      });
    },
    removeBlocks: (blockIds: string[]) => {
      setBlocks((prevBlocks) => {
        const blocks = removeNestedBlocks(prevBlocks, blockIds);
        postMessage({ type: "blocks-updated", blocks });
        runValidation();
        incrementActionsCount();
        return blocks;
      });
    },
    moveBlocks: (blockIds: string[], newParent: string | null, position: number) => {
      setBlocks((prevBlocks) => {
        let blocks = [...prevBlocks];
        for (let i = 0; i < blockIds.length; i++) {
          blocks = moveBlocksWithChildren(blocks, blockIds[i], newParent, position);
        }
        each(blockIds, (id: string) => {
          const block = find(blocks, (b) => b._id === id);
          if (block) {
            updateBlockAtom({ id, props: { _parent: block._parent || null } });
          }
        });
        postMessage({ type: "blocks-updated", blocks });
        runValidation();
        incrementActionsCount();
        return blocks;
      });
    },
    updateBlocksProps: (blocks: (Partial<ChaiBlock> & { _id: string })[]) => {
      blocks.forEach((block) => {
        const updatedBlock = omit(block, "_id");
        updateBlockAtom({ id: block._id, props: updatedBlock });
      });
      postMessage({ type: "blocks-props-updated", blocks });
      runValidation();
      incrementActionsCount();
    },
    replaceBlocks: (removeIds: string[], newBlocks: ChaiBlock[], parent?: string, position?: number) => {
      setBlocks((prevBlocks) => {
        let blocks = removeNestedBlocks(prevBlocks, removeIds);
        blocks = insertBlocksAtPosition(blocks, newBlocks, parent, position);
        postMessage({ type: "blocks-updated", blocks });
        runValidation();
        incrementActionsCount();
        return blocks;
      });
    },
  };
};
