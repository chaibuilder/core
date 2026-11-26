import {
  CardStackIcon,
  CardStackPlusIcon,
  CopyIcon,
  EraserIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  Pencil2Icon,
  ScissorsIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useAtom } from "jotai";
import { has, isEmpty } from "lodash-es";
import { FrameIcon, Replace, SquarePlus } from "lucide-react";
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { makePartialBlockModalAtom } from "~/builder/atoms/builder";
import { treeRefAtom } from "~/builder/atoms/ui";
import { ClearCanvas } from "~/builder/core/components/canvas/topbar/clear-canvas";
import { SaveToLibrary } from "~/builder/core/components/sidepanels/panels/outline/save-to-library";
import { UnlinkLibraryBlock } from "~/builder/core/components/sidepanels/panels/outline/unlink-library-block";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import {
  canAddChildBlock,
  canDeleteBlocks,
  canDuplicateBlocks,
  canMoveBlocks,
} from "~/builder/core/functions/block-helpers";
import { pubsub } from "~/builder/core/pubsub";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { isPartialBlockType } from "~/builder/hooks/partial-blocks";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useCopyBlocks } from "~/builder/hooks/use-copy-blockIds";
import { useCreatePartialLabel, usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useCutBlockIds } from "~/builder/hooks/use-cut-blockIds";
import { useDuplicateBlocks } from "~/builder/hooks/use-duplicate-blocks";
import { usePasteBlocks } from "~/builder/hooks/use-paste-blocks";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useUpdateBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import { CHAI_SLOT_IDS, ChaiSlot } from "~/builder/register-apis";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { UnwrapComponent } from "./unwrap-block";
import { WrapWithComponent } from "./wrap-with-block";

const MakePartialBlock = ({ MenuItem = DropdownMenuItem }: { MenuItem?: React.ComponentType<any> }) => {
  const selectedBlock = useSelectedBlock();
  const [, setModalState] = useAtom(makePartialBlockModalAtom);
  const label = useCreatePartialLabel();
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);

  if (!partialBlocksEnabled) return null;
  if (
    selectedBlock?._type === "BODY" ||
    selectedBlock?._type === "PartialBlock" ||
    selectedBlock?._type === "ChaiSlot"
  )
    return null;

  return (
    <MenuItem
      onClick={() => setModalState({ isOpen: true, blockId: selectedBlock?._id || null })}
      className="flex items-center gap-x-2 text-xs">
      <FrameIcon className="h-3.5 w-3.5" /> {label}
    </MenuItem>
  );
};

const CopyPasteBlocks = ({
  isFromBody = false,
  MenuItem = DropdownMenuItem,
}: {
  isFromBody?: boolean;
  MenuItem?: React.ComponentType<any>;
}) => {
  const [blocks] = useBlocksStore();
  const [selectedIds] = useSelectedBlockIds();
  const { pasteBlocks } = usePasteBlocks();
  const [, copyBlocks, hasPartialBlocks] = useCopyBlocks();
  const { t } = useTranslation();
  const { plural } = usePartialTypeLabel();
  const selectedBlock = useSelectedBlock();
  const enableCopyToClipboard = useBuilderProp("flags.copyPaste", true);

  const handleCopy = useCallback(() => {
    const actionableBlocks = isFromBody
      ? blocks?.filter((block) => !block?._parent)?.map((block) => block?._id)
      : selectedIds;
    const selectedBlocks = actionableBlocks.map((id) => {
      const block = blocks.find((b) => b._id === id);
      return {
        id,
        data: block,
      };
    });

    if (hasPartialBlocks(selectedBlocks.map((block) => block.id))) {
      toast.warning(t("{{name}} detected. Clone {{name}}?", { name: plural }), {
        cancel: {
          label: t("No"),
          onClick: () => {
            copyBlocks(selectedBlocks.map((block) => block.id));
            toast.dismiss();
          },
        },
        action: {
          label: t("Yes"),
          onClick: () => {
            copyBlocks(
              selectedBlocks.map((block) => block.id),
              true,
            );
            toast.dismiss();
          },
        },
        position: "top-center",
      });
      // setCopiedBlocks(selectedBlocks.map((block) => block.id));
    } else {
      copyBlocks(selectedBlocks.map((block) => block.id));
    }
  }, [isFromBody, blocks, selectedIds, hasPartialBlocks, t, copyBlocks]);

  return (
    <>
      {enableCopyToClipboard && (
        <MenuItem
          // Body "Copy" copies the body's children (every root block), not the
          // BODY itself — so it's enabled whenever there are children, regardless
          // of whether a block is selected. Guarding it on `selectedBlock` (which
          // is empty when right-clicking the body row) grayed it out entirely.
          disabled={
            isFromBody
              ? isEmpty(blocks?.filter((block) => !block?._parent))
              : selectedBlock?._type
                ? !canDuplicateBlocks(selectedIds, blocks)
                : true
          }
          onClick={handleCopy}
          className="flex items-center gap-x-2 text-xs">
          <CopyIcon /> {t("Copy")}
        </MenuItem>
      )}
      {enableCopyToClipboard && (
        <MenuItem
          className="flex items-center gap-x-2 text-xs"
          onClick={() => {
            pasteBlocks(selectedIds);
          }}>
          <CardStackIcon /> {t("Paste")}
        </MenuItem>
      )}
    </>
  );
};

const CutBlocks = ({ MenuItem = DropdownMenuItem }: { MenuItem?: React.ComponentType<any> }) => {
  const [selectedIds] = useSelectedBlockIds();
  const [, setCutBlockIds] = useCutBlockIds();
  const [blocks] = useBlocksStore();
  const { t } = useTranslation();
  const enableCopyToClipboard = useBuilderProp("flags.copyPaste", true);

  return (
    <>
      {enableCopyToClipboard && (
        <MenuItem
          disabled={!canMoveBlocks(selectedIds, blocks)}
          className="flex items-center gap-x-2 text-xs"
          onClick={() => setCutBlockIds(selectedIds)}>
          <ScissorsIcon /> {t("Cut")}
        </MenuItem>
      )}
    </>
  );
};

const RemoveBlocks = ({ MenuItem = DropdownMenuItem }: { MenuItem?: React.ComponentType<any> }) => {
  const [selectedIds] = useSelectedBlockIds();
  const removeBlocks = useRemoveBlocks();
  const [blocks] = useBlocksStore();
  const { t } = useTranslation();

  return (
    <MenuItem
      disabled={!canDeleteBlocks(selectedIds, blocks)}
      className="flex items-center gap-x-2 text-xs"
      onClick={() => removeBlocks(selectedIds)}>
      <TrashIcon /> {t("Remove")}
    </MenuItem>
  );
};

const RenameBlock = ({ node, MenuItem = DropdownMenuItem }: { node: any; MenuItem?: React.ComponentType<any> }) => {
  const { t } = useTranslation();
  // A used partial takes its outline label from the referenced partial itself, so
  // there is nothing to rename here — renaming the partial page renames every row.
  if (isPartialBlockType(node?.data?._type)) return null;
  return (
    <MenuItem
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        setTimeout(() => {
          node.edit();
        }, 200);
      }}
      className="flex items-center gap-x-2 text-xs">
      <Pencil2Icon className="h-4 w-4" /> {t("Rename")}
    </MenuItem>
  );
};

const ToggleBlockVisibility = ({ MenuItem = DropdownMenuItem }: { MenuItem?: React.ComponentType<any> }) => {
  const { t } = useTranslation();
  const selectedBlock = useSelectedBlock();
  const updateBlockProps = useUpdateBlocksProps();
  const [treeRef] = useAtom(treeRefAtom);

  const isVisible = has(selectedBlock, "_show") ? selectedBlock._show : true;
  const isHidden = !isVisible;

  const toggleVisibility = useCallback(() => {
    if (!selectedBlock) return;

    // If hiding the block, collapse it in the tree
    if (isVisible && treeRef) {
      const node = treeRef.get(selectedBlock._id);
      if (node?.isOpen) {
        node.close();
      }
    }

    updateBlockProps([selectedBlock._id], { _show: !isVisible });
  }, [selectedBlock, isVisible, updateBlockProps, treeRef]);

  return (
    <MenuItem onClick={toggleVisibility} className="flex items-center gap-x-2 text-xs">
      {isHidden ? (
        <>
          <EyeOpenIcon className="h-4 w-4" /> {t("Show block")}
        </>
      ) : (
        <>
          <EyeClosedIcon className="h-4 w-4" /> {t("Hide block")}
        </>
      )}
    </MenuItem>
  );
};

const BlockContextMenuContent = ({
  node,
  MenuItem = DropdownMenuItem,
  type,
}: {
  node: any;
  MenuItem: React.ComponentType<any>;
  type: "option" | "context";
}) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useSelectedBlockIds();
  const duplicateBlocks = useDuplicateBlocks();
  const selectedBlock = useSelectedBlock();
  const [blocks] = useBlocksStore();
  const { hasPermission } = usePermissions();
  const { librarySite } = useBuilderProp("flags", { librarySite: false });

  const duplicate = useCallback(() => {
    duplicateBlocks(selectedIds);
  }, [selectedIds, duplicateBlocks]);

  const isLibLinkedBlock = useMemo(() => {
    return has(selectedBlock, "_libBlockId") && !isEmpty(selectedBlock._libBlockId);
  }, [selectedBlock]);

  if (node === "BODY") {
    return (
      <>
        {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
          <>
            <MenuItem
              disabled={false}
              className="flex items-center gap-x-2 text-xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedIds([]);
                pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { forceModal: true });
              }}>
              <SquarePlus className="h-3.5 w-3.5" /> {t("Add block")}
            </MenuItem>
            {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
              <CopyPasteBlocks isFromBody={true} MenuItem={MenuItem} />
            )}
            <MenuItem
              disabled={false}
              onClick={(e: React.MouseEvent) => e.preventDefault()}
              className="flex items-center gap-x-2 text-xs">
              <ClearCanvas>
                <div className="flex items-center gap-x-2 text-xs">
                  <EraserIcon /> {t("Clear canvas")}
                </div>
              </ClearCanvas>
            </MenuItem>
            <ChaiSlot slotId={CHAI_SLOT_IDS.AFTER_BODY_BLOCK_OPTIONS} context={{ MenuItem }} />
          </>
        )}
      </>
    );
  }

  return (
    <>
      {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
        <>
          <WrapWithComponent type={type} />
          <UnwrapComponent MenuItem={MenuItem} />
          <DropdownMenuSeparator />
        </>
      )}
      <MakePartialBlock MenuItem={MenuItem} />
      {hasPermission(CHAI_PERMISSIONS["library:create"]) && librarySite && <SaveToLibrary MenuItem={MenuItem} />}
      <ToggleBlockVisibility MenuItem={MenuItem} />
      <DropdownMenuSeparator />
      {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
        <>
          <MenuItem
            className="flex items-center gap-x-2 text-xs"
            disabled={selectedBlock?._type ? !canAddChildBlock(selectedBlock._type) : true}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setSelectedIds([node.data._id]);
              pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { ...node.data, forceModal: true });
            }}>
            <SquarePlus className="h-3.5 w-3.5" /> {t("Add block")}
          </MenuItem>
          <MenuItem
            className="flex items-center gap-x-2 text-xs"
            disabled={!canDeleteBlocks([node.data._id], blocks)}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { replaceBlockId: node.data._id, forceModal: true });
            }}>
            <Replace className="h-3.5 w-3.5" /> {t("Replace block")}
          </MenuItem>
          <MenuItem
            disabled={selectedBlock?._type ? !canDuplicateBlocks(selectedIds, blocks) : true}
            className="flex items-center gap-x-2 text-xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              duplicate();
            }}>
            <CardStackPlusIcon /> {t("Duplicate")}
          </MenuItem>
        </>
      )}
      <RenameBlock node={node} MenuItem={MenuItem} />
      {hasPermission(CHAI_PERMISSIONS["pages:update"]) && <CutBlocks MenuItem={MenuItem} />}
      {hasPermission(CHAI_PERMISSIONS["pages:update"]) && <CopyPasteBlocks MenuItem={MenuItem} />}
      {isLibLinkedBlock && librarySite && <UnlinkLibraryBlock MenuItem={MenuItem} />}
      {hasPermission(CHAI_PERMISSIONS["pages:update"]) && <RemoveBlocks MenuItem={MenuItem} />}
      <ChaiSlot slotId={CHAI_SLOT_IDS.AFTER_BLOCK_OPTIONS} context={{ MenuItem }} />
    </>
  );
};

// A menu action that moved focus into a dialog (e.g. Replace block) keeps it there.
const keepFocusInDialog = (event: Event) => {
  if (document.activeElement?.closest('[role="dialog"]')) event.preventDefault();
};

export const BlockMoreOptions = ({
  children,
  id,
  node,
  type = "option",
}: {
  children: React.ReactNode | null;
  id: any;
  node: any;
  type?: "context" | "option";
}) => {
  const { t } = useTranslation();
  const [, setSelectedIds] = useSelectedBlockIds();

  if (type === "context") {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="m-0 flex h-full flex-1 p-0">{children}</ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={keepFocusInDialog}>
          <ContextMenuLabel className="leading-none">{t("ACTIONS")}</ContextMenuLabel>
          <ContextMenuSeparator />
          <BlockContextMenuContent type={type} node={node} MenuItem={ContextMenuItem} />
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) setSelectedIds([id]);
        }}>
        <DropdownMenuTrigger>{children}</DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" onCloseAutoFocus={keepFocusInDialog}>
          <BlockContextMenuContent node={node} type={type} MenuItem={DropdownMenuItem} />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
