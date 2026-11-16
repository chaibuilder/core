import find from "lodash-es/find";
import { useCallback } from "react";
import { canDeleteBlocks } from "~/builder/core/functions/block-helpers";
import {
  useBlocksStore,
  useBlocksStoreUndoableActions,
} from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { removeNestedBlocks } from "~/utils/blocks-tree-ops";

export { removeNestedBlocks };

export const useRemoveBlocks = () => {
  const [presentBlocks] = useBlocksStore();
  const [, setSelectedIds] = useSelectedBlockIds();
  const { setNewBlocks } = useBlocksStoreUndoableActions();
  const { hasPermission } = usePermissions();

  return useCallback(
    (blockIds: Array<string>) => {
      if (!hasPermission(CHAI_PERMISSIONS["pages:update"])) return;
      if (!canDeleteBlocks(blockIds, presentBlocks)) return;
      const parentBlockId = find(presentBlocks, { _id: blockIds[0] })?._parent || null;
      setNewBlocks(removeNestedBlocks(presentBlocks, blockIds));
      setTimeout(() => setSelectedIds(parentBlockId ? [parentBlockId] : []), 200);
    },
    [hasPermission, presentBlocks, setNewBlocks, setSelectedIds],
  );
};
