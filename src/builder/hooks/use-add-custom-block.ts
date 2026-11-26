import { useCallback } from "react";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { getRegisteredChaiBlock } from "~/registry";
import { buildCustomBlockTree, sanitizeAiProps } from "~/server/chai-actions/ai/ask-ai/ai-edit-executors";

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

      // Same tree manual Add inserts (template slots/children, registered defaults), with the AI's props on the root.
      await addPredefinedBlock(buildCustomBlockTree(type, sanitizeAiProps(props)), parentId, position);
    },
    [addPredefinedBlock],
  );
};
