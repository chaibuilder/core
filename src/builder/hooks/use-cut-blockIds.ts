import { atom, useAtom, useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { canMoveBlocks } from "~/builder/core/functions/block-helpers";
import { copiedBlockIdsAtom } from "~/builder/hooks/use-copy-blockIds";

export const cutBlockIdsAtom = atom<Array<string>>([]);

export const useCutBlockIds = () => {
  const [ids, setIds] = useAtom(cutBlockIdsAtom);
  const resetCopyIds = useSetAtom(copiedBlockIdsAtom);
  const store = useStore();

  const setCutBlockIds = useCallback(
    (blockIds: Array<string>) => {
      // Cut is a move, so a block that cannot move cannot be cut.
      if (!canMoveBlocks(blockIds, store.get(presentBlocksAtom))) return;
      setIds(blockIds);
      resetCopyIds([]);
    },
    [setIds, resetCopyIds, store],
  );

  return [ids as string[], setCutBlockIds] as const;
};
