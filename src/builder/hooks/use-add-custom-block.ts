import { useCallback } from "react";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types/common";

/**
 * Adds a registered custom block to the page from typed props JSON.
 * This is the tool-call equivalent of HTML → getBlocksFromHTML → addPredefinedBlock.
 */
export const useAddCustomBlock = () => {
  const { addPredefinedBlock } = useAddBlock();

  return useCallback(
    async (type: string, parentId: string | undefined, position: number | undefined, props: Record<string, any>) => {
      const registeredBlock = getRegisteredChaiBlock(type);
      if (!registeredBlock) {
        console.warn(`[useAddCustomBlock] Unknown block type: "${type}". Skipping.`);
        return;
      }

      const block: ChaiBlock = {
        _id: generateUuid(),
        _type: type,
        ...props,
      };

      await addPredefinedBlock([block], parentId, position);
    },
    [addPredefinedBlock],
  );
};
