import { useStore } from "jotai";
import { isEmpty } from "lodash-es";
import { useCallback, useMemo } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { canDuplicateBlocks } from "~/builder/core/functions/block-helpers";
import { useCopyBlocks as useCopyBlockIds } from "~/builder/hooks/use-copy-blockIds";
import { useCutBlockIds } from "~/builder/hooks/use-cut-blockIds";
import { useDuplicateBlocks } from "~/builder/hooks/use-duplicate-blocks";
import { usePasteBlocks } from "~/builder/hooks/use-paste-blocks";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";

/**
 * Block-selection keyboard commands (copy/cut/paste/duplicate/remove/deselect),
 * shared by BOTH keyboard entry points so their behavior can't drift:
 *  - `use-key-event-watcher` — the document-level react-hotkeys listeners (parent
 *    + canvas iframe), which fire when focus is inside the canvas.
 *  - the outline tree's React `onKeyDown` — which fires when focus is on a sidebar
 *    treeitem in the parent document, where the document-level listeners don't
 *    reliably receive the keydown across the iframe realm.
 *
 * All commands operate on the current `useSelectedBlockIds` selection.
 */
export const useBlockKeyboardCommands = () => {
  const [ids, setIds] = useSelectedBlockIds();
  const removeBlocks = useRemoveBlocks();
  const duplicateBlocks = useDuplicateBlocks();
  const [, setCutBlockIds] = useCutBlockIds();
  const [, setCopyBlockIds] = useCopyBlockIds();
  const { canPaste, pasteBlocks } = usePasteBlocks();

  const store = useStore();

  const copy = useCallback(() => {
    if (isEmpty(ids)) return;
    // A copy pastes as a duplicate, so it follows the duplicate rule.
    if (!canDuplicateBlocks(ids, store.get(presentBlocksAtom))) return;
    setCopyBlockIds(ids);
  }, [ids, setCopyBlockIds, store]);

  const cut = useCallback(() => {
    if (isEmpty(ids)) return;
    setCutBlockIds(ids);
  }, [ids, setCutBlockIds]);

  const paste = useCallback(async () => {
    if (isEmpty(ids)) return;
    if (await canPaste(ids[0])) pasteBlocks(ids);
  }, [ids, canPaste, pasteBlocks]);

  const duplicate = useCallback(() => {
    if (isEmpty(ids)) return;
    duplicateBlocks(ids);
  }, [ids, duplicateBlocks]);

  const remove = useCallback(() => {
    if (isEmpty(ids)) return;
    // removeBlocks rejects the whole selection if any block can't be deleted.
    removeBlocks(ids);
  }, [ids, removeBlocks]);

  const deselect = useCallback(() => setIds([]), [setIds]);

  return useMemo(
    () => ({ ids, hasSelection: !isEmpty(ids), copy, cut, paste, duplicate, remove, deselect }),
    [ids, copy, cut, paste, duplicate, remove, deselect],
  );
};
