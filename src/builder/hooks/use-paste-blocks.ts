import { useAtomValue } from "jotai";
import { find, first, has, isEmpty } from "lodash-es";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { canAcceptInto, canMoveBlocks, releaseTopLevelLocks } from "~/builder/core/functions/block-helpers";
import {
  useBlocksStore,
  useBlocksStoreUndoableActions,
} from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useCutBlockIds } from "~/builder/hooks/use-cut-blockIds";
import { useCheckPartialCanAdd } from "~/builder/hooks/use-partial-blocks-store";
import { ChaiBlock } from "~/types/common";

const isFirefox = () => {
  return navigator.userAgent.toLowerCase().includes("firefox");
};

const useCanPaste = () => {
  const [blocks] = useBlocksStore();
  return (ids: string[], newParentId: string | null) => {
    const blockType = first(ids.map((id) => (find(blocks, { _id: id }) as ChaiBlock)?._type));
    if (!canMoveBlocks(ids, blocks)) return false;
    return canAcceptInto(find(blocks, { _id: newParentId }) as ChaiBlock | undefined, blockType!, blocks);
  };
};

const useMoveCutBlocks = () => {
  const presentBlocks = useAtomValue(presentBlocksAtom);
  const { moveBlocks } = useBlocksStoreUndoableActions();

  return useCallback(
    (blockIds: Array<string>, newParentId: string[] | string) => {
      const parentId = Array.isArray(newParentId) ? newParentId[0] : newParentId;
      if (!canMoveBlocks(blockIds, presentBlocks)) return;
      if (newParentId === "root") {
        const newParentBlock = presentBlocks?.filter((block) => !block._parent);
        moveBlocks(blockIds, undefined, newParentBlock?.length || 0);
      } else {
        const newParentBlock = presentBlocks?.filter((block) => block._parent === parentId);
        moveBlocks(blockIds, parentId, newParentBlock?.length || 0);
      }
    },
    [moveBlocks, presentBlocks],
  );
};

export const usePasteBlocks = (): {
  canPaste: (newParentId: string) => Promise<boolean>;
  pasteBlocks: (newParentId: string | string[]) => Promise<void>;
} => {
  const { t } = useTranslation();
  const [cutBlockIds, setCutBlockIds] = useCutBlockIds();
  const moveCutBlocks = useMoveCutBlocks();
  const { addPredefinedBlock } = useAddBlock();
  const checkPartialCanAdd = useCheckPartialCanAdd();
  const { singular } = usePartialTypeLabel();

  // Pasted blocks can carry partial references copied from another page where
  // the nesting rules allowed them — re-validate against the current page.
  const validatePartialRefs = useCallback(
    (blocks: ChaiBlock[]) => {
      for (const block of blocks ?? []) {
        if (block?._type !== "PartialBlock" && block?._type !== "GlobalBlock") continue;
        const partialBlockId = (block.partialBlockId ?? block.globalBlock ?? "") as string;
        if (!partialBlockId) continue;
        const { canAdd, reason } = checkPartialCanAdd(partialBlockId);
        if (!canAdd) {
          throw new Error(reason || t("This {{name}} cannot be pasted here", { name: singular }));
        }
      }
    },
    [checkPartialCanAdd, singular, t],
  );

  const canPasteBlocks = useCanPaste();
  const canPaste = useCallback(
    async (newParentId: string) => {
      if (cutBlockIds.length > 0) {
        return canPasteBlocks(cutBlockIds, newParentId);
      }
      if (isFirefox()) {
        return false;
      }
      try {
        const clipboardContent = await navigator.clipboard.readText();
        if (clipboardContent) {
          const clipboardData = JSON.parse(clipboardContent);
          return has(clipboardData, "_chai_copied_blocks");
        }
      } catch {
        return false;
      }
      return false;
    },
    [canPasteBlocks, cutBlockIds],
  );

  return {
    canPaste,
    pasteBlocks: useCallback(
      async (newParentId: string | string[]) => {
        const parentId = Array.isArray(newParentId) ? newParentId[0] : newParentId;

        if (!isEmpty(cutBlockIds)) {
          moveCutBlocks(cutBlockIds, newParentId);
          setCutBlockIds([]);
          if (!isFirefox()) {
            await navigator.clipboard.writeText("");
          }
          return;
        }

        if (isFirefox()) {
          toast.error(t("Paste is not supported in Firefox"));
          return;
        }

        if (!navigator?.permissions) {
          toast.error(t("Cannot check clipboard permissions."));
          return;
        }
        try {
          const permissionStatus = await navigator.permissions.query({
            name: "clipboard-read" as PermissionName,
          });
          if (permissionStatus.state === "denied") {
            toast.error(t("Clipboard paste permission denied. Please allow clipboard access."));
            return;
          }
        } catch {
          toast.error(t("Failed to check clipboard permissions. Please allow clipboard access."));
          return;
        }

        toast.promise(
          async () => {
            const clipboardContent = await navigator.clipboard.readText();
            if (clipboardContent) {
              const clipboardData = JSON.parse(clipboardContent);
              if (has(clipboardData, "_chai_copied_blocks")) {
                validatePartialRefs(clipboardData._chai_copied_blocks);
                addPredefinedBlock(
                  releaseTopLevelLocks(clipboardData._chai_copied_blocks),
                  parentId === "root" ? null : parentId,
                );
              } else {
                throw new Error(t("Nothing to paste"));
              }
            } else {
              throw new Error(t("Nothing to paste"));
            }
          },
          {
            success: () => t("Blocks pasted successfully"),
            error: (error: unknown) => {
              return error instanceof Error && error.message ? error.message : t("Nothing to paste");
            },
          },
        );
      },
      [cutBlockIds, moveCutBlocks, setCutBlockIds, addPredefinedBlock, validatePartialRefs, t],
    ),
  };
};
