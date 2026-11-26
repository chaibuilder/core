import { useAtomValue } from "jotai";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dragAndDropAtom, useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { cn } from "~/builder/core/utils/cn";
import { ReplaceBlockIdContext } from "~/builder/hooks/use-add-block";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { Dialog, DialogContent, DialogHeader, DialogPortal, DialogTitle } from "~/components/ui/dialog";
import { ChaiBlock } from "~/types/common";

// Deferred: the block catalogue pulls in fuse.js and the block-library panels, but the
// dialog itself must stay mounted to listen for the open/close events. Load the panel
// only once the dialog is actually opened.
const AddBlocksPanel = lazy(() => import("~/builder/core/components/sidepanels/panels/add-blocks/add-blocks"));

interface AddBlockEventData {
  _id: string;
  position?: number;
  /**
   * Forces the modal even when drag and drop is on. Set by every outline trigger:
   * the side panel has no parent/position, so routing them there would silently
   * drop the target.
   */
  forceModal?: boolean;
  /** Block to swap out for the picked one, at its own parent and index. */
  replaceBlockId?: string;
}

// Parent and sibling index of the block being replaced.
const getReplaceSlot = (blockId: string) => {
  const blocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
  const target = blocks.find((b) => b._id === blockId);
  if (!target) return null;
  const siblings = blocks.filter((b) => (target._parent ? b._parent === target._parent : !b._parent));
  return { parentId: target._parent ?? null, position: siblings.indexOf(target) };
};

const useAddBlocksDialogState = () => {
  const [parentId, setParentId] = useState<string | null>(null);
  const [position, setPosition] = useState<number>(-1);
  const [open, setOpen] = useState(false);
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const [, setActivePanel] = useSidebarActivePanel();
  const [replaceBlockId, setReplaceBlockId] = useState<string | null>(null);

  const draggedBlock = useAtomValue(dragAndDropAtom);
  const isDraggingNewBlock = Boolean(draggedBlock) && !draggedBlock?._id;
  /**
   * Latched when a drag starts inside the dialog. A block dragged out of the modal
   * keeps the modal's DOM as its native drag source, and tearing that source out
   * mid-drag cancels the drag in Chrome and swallows the `dragend` that cleans the
   * drag state up. So the drag closes the modal visually only; the panel is
   * unmounted once the drag has settled (drop, cancel or a drag that never
   * registered a block — all of which clear `dragAndDropAtom`).
   */
  const [draggingOut, setDraggingOut] = useState(false);

  const handleOpen = useCallback(
    (data: AddBlockEventData | undefined) => {
      const replaceSlot = data?.replaceBlockId ? getReplaceSlot(data.replaceBlockId) : null;
      // The block to replace is gone (undo, collaboration): don't fall back to a root add.
      if (data?.replaceBlockId && !replaceSlot) return;
      setReplaceBlockId(replaceSlot ? data!.replaceBlockId! : null);
      if (replaceSlot) {
        setParentId(replaceSlot.parentId);
        setPosition(replaceSlot.position);
        setOpen(true);
      } else if (isDragAndDropEnabled && !data?.forceModal) {
        setActivePanel("add-block");
      } else {
        setParentId(data?._id ?? null);
        setPosition(data?.position ?? -1);
        setOpen(true);
      }
    },
    [isDragAndDropEnabled, setActivePanel],
  );

  const handleClose = useCallback(() => {
    setParentId(null);
    setPosition(-1);
    setReplaceBlockId(null);
    setOpen(false);
  }, []);

  // `open` is still true while the drag is being handed over (the close event is
  // published a tick later), so only release the drag hold once the modal has
  // actually closed and no new block is in flight.
  useEffect(() => {
    if (draggingOut && !open && !isDraggingNewBlock) setDraggingOut(false);
  }, [draggingOut, open, isDraggingNewBlock]);

  usePubSubListener(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, handleOpen);
  usePubSubListener(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK, handleClose);

  const holdForDrag = useCallback(() => setDraggingOut(true), []);

  return {
    parentId,
    position,
    isMounted: open || draggingOut,
    isHidden: !open && draggingOut,
    replaceBlockId,
    handleClose,
    holdForDrag,
  };
};

export const AddBlocksDialog = () => {
  const { t } = useTranslation();
  const { parentId, position, isMounted, isHidden, replaceBlockId, handleClose, holdForDrag } =
    useAddBlocksDialogState();

  return (
    // Non-modal on purpose: a block dragged out of the dialog keeps it mounted, and
    // a modal dialog holds `pointer-events: none` on the body for as long as it is
    // mounted, so the canvas would never receive the drag.
    <Dialog open={isMounted} modal={false} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogPortal>
        {/* Radix only renders `Dialog.Overlay` for modal dialogs, so this one brings
            its own backdrop. It is dropped while a block is being dragged out, to
            leave the canvas underneath free to take the drop. */}
        <div
          aria-hidden
          onClick={handleClose}
          className={cn("bg-muted/30 dark:bg-accent/5 fixed inset-0 z-50 backdrop-blur-sm", isHidden && "hidden")}
        />
      </DialogPortal>
      <DialogContent
        aria-describedby={undefined}
        // A closing context menu hands focus back to its trigger; don't treat that as dismiss.
        onFocusOutside={(e) => e.preventDefault()}
        className={cn("border-border max-w-[450px] overflow-hidden", isHidden && "pointer-events-none opacity-0")}>
        <DialogHeader>
          <DialogTitle className="text-foreground">{t(replaceBlockId ? "Replace block" : "Add blocks")}</DialogTitle>
        </DialogHeader>
        <div className="no-scrollbar h-[500px] max-h-full overflow-hidden" onDragStart={holdForDrag}>
          <Suspense fallback={null}>
            {/* `fromSidebar` is the panel's narrow layout: compact tabs, one column,
                block/library groups stacked instead of split into their own pane.
                The modal is the same width as the sidebar, so it wants that layout
                rather than the wide two-pane one. */}
            <ReplaceBlockIdContext.Provider value={replaceBlockId}>
              <AddBlocksPanel parentId={parentId ?? ""} position={position} showHeading={false} fromSidebar={true} />
            </ReplaceBlockIdContext.Provider>
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
};
