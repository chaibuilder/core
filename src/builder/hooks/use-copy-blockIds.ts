import { atom, useAtom, useSetAtom } from "jotai";
import { isEmpty, set } from "lodash-es";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getDuplicatedBlocks } from "~/builder/core/functions/blocks-fn";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { cutBlockIdsAtom } from "~/builder/hooks/use-cut-blockIds";
import { usePartialBlocksStore } from "~/builder/hooks/use-partial-blocks-store";
import { ChaiBlock } from "~/types/common";

export const copiedBlockIdsAtom = atom<Array<string>>([]);

export interface CopiedBlock {
  id: string;
  data: any;
}

export interface ClipboardBlock {
  _chai_copied_blocks: any;
}

export const useCopyBlocks = (): [
  Array<string>,
  (blockIds: Array<string>, clonePartialBlocks?: boolean) => void,
  (blockIds: Array<string>) => boolean,
] => {
  const { t } = useTranslation();
  const [presentBlocks] = useBlocksStore();
  const [ids, setIds] = useAtom(copiedBlockIdsAtom);
  const resetCutBlockIds = useSetAtom(cutBlockIdsAtom);
  const { getPartialBlocks } = usePartialBlocksStore();
  const enableCopyToClipboard = useBuilderProp("flags.copyPaste", true);

  const hasPartialBlocks = useCallback(
    (blockIds: Array<string>) => {
      return blockIds.some((id) => {
        const duplicatedBlocks = getDuplicatedBlocks(presentBlocks, id, null);
        return duplicatedBlocks.some((block) => block._type === "PartialBlock" || block._type === "GlobalBlock");
      });
    },
    [presentBlocks],
  );

  const copyBlocks = useCallback(
    async (blockIds: Array<string>, clonePartialBlocks: boolean = false) => {
      try {
        if (isEmpty(blockIds)) return;
        setIds(blockIds);
        resetCutBlockIds([]);

        const clipboardData: ClipboardBlock = {
          _chai_copied_blocks: blockIds.flatMap((blockId) => {
            // Get duplicated blocks with children
            const duplicatedBlocks = getDuplicatedBlocks(presentBlocks, blockId, null);
            if (!clonePartialBlocks) {
              return duplicatedBlocks;
            }
            let result: Array<ChaiBlock> = [];
            //check for partial blocks. If found, replace the block with the actual partial blocks
            for (const block of duplicatedBlocks) {
              if (block._type === "PartialBlock" || block._type === "GlobalBlock") {
                // Get the expanded content of the partial block
                let partialBlocks = getPartialBlocks(block.partialBlockId!);
                if (block._parent && partialBlocks?.length > 0) {
                  partialBlocks = partialBlocks.map((b) => {
                    if (isEmpty(b._parent)) {
                      set(b, "_parent", block._parent);
                    }
                    return b;
                  });
                }
                // Add each block from the partial block to our result
                result = [...result, ...partialBlocks];
              } else {
                // Keep non-partial blocks as is
                result.push(block);
              }
            }
            return result;
          }),
        };
        if (!enableCopyToClipboard) {
          return;
        }
        if (!navigator.clipboard) {
          toast.error(t("Clipboard not available."));
          return;
        }
        toast.promise(navigator.clipboard.writeText(JSON.stringify(clipboardData)), {
          success: t("Blocks copied successfully"),
          error: t("Failed to copy blocks to clipboard"),
        });
      } catch (error) {
        toast.error(t("Failed to copy blocks to clipboard"));
        console.error("Failed to copy blocks to clipboard:", error);
      }
    },
    [setIds, resetCutBlockIds, enableCopyToClipboard, presentBlocks, getPartialBlocks, t],
  );

  return [ids as string[], copyBlocks, hasPartialBlocks];
};
