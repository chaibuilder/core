import { BoxIcon, Link2Icon } from "@radix-ui/react-icons";
import { has } from "lodash-es";
import { Package } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { canAcceptChildBlock, canAcceptInto, canMoveBlock } from "~/builder/core/functions/block-helpers";
import { generateUUID } from "~/builder/core/functions/common-functions";
import {
  useBlocksStore,
  useBlocksStoreUndoableActions,
} from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "~/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "~/components/ui/dropdown-menu";
import { getBlockDefaultProps } from "~/registry";

export const useWrapWithBlock = () => {
  const selectedBlock = useSelectedBlock();
  const [, setBlockIds] = useSelectedBlockIds();
  const { moveBlocks, addBlocks } = useBlocksStoreUndoableActions();
  const [blocks] = useBlocksStore();

  const wrapInBlock = useCallback(
    (wrapperType: string) => {
      if (!selectedBlock || !canMoveBlock(selectedBlock)) return;
      const parentId = selectedBlock._parent;
      const siblings = blocks.filter((b) => (!parentId ? !b._parent : b._parent === parentId));
      const position = siblings.findIndex((b) => b._id === selectedBlock._id);

      const defaultProps = getBlockDefaultProps(wrapperType) as Record<string, any>;
      // Remove text content when wrapping so it doesn't leave stray text blocks/strings behind
      if (has(defaultProps, "content")) {
        defaultProps.content = "";
      }
      const wrapperId = generateUUID();
      const wrapperBlock: any = {
        _id: wrapperId,
        _type: wrapperType,
        _parent: parentId ?? null,
        _name: wrapperType,
        ...defaultProps,
      };

      addBlocks([wrapperBlock], parentId ?? undefined, position !== -1 ? position : undefined);

      setTimeout(() => {
        moveBlocks([selectedBlock._id], wrapperId, 0);
        setBlockIds([wrapperId]);
      }, 100);
    },
    [addBlocks, moveBlocks, selectedBlock, blocks, setBlockIds],
  );

  const parentBlock = selectedBlock?._parent ? blocks.find((b) => b._id === selectedBlock._parent) : undefined;

  // Wrapping re-parents the block, so it is a move.
  const isValidBlock = !!selectedBlock && selectedBlock._type !== "BODY" && canMoveBlock(selectedBlock);
  const selectedType = selectedBlock?._type ?? "";
  const canWrapInBox =
    isValidBlock && canAcceptChildBlock("Box", selectedType) && canAcceptInto(parentBlock, "Box", blocks);
  const canWrapInLink =
    isValidBlock && canAcceptChildBlock("Link", selectedType) && canAcceptInto(parentBlock, "Link", blocks);

  return {
    canWrapInBox,
    canWrapInLink,
    wrapInBlock,
    shouldRender: canWrapInBox || canWrapInLink,
  };
};

// ============ Components ============

export const WrapWithComponent = ({ type }: { type: string }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const { canWrapInBox, canWrapInLink, wrapInBlock, shouldRender } = useWrapWithBlock();

  if (!shouldRender) return null;

  const isContextMenu = type === "context";

  if (isContextMenu) {
    return (
      <div onMouseLeave={() => setShow(false)} onMouseEnter={() => setShow(true)}>
        <ContextMenuSub open={show}>
          <ContextMenuSubTrigger
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="flex cursor-pointer items-center gap-x-2 text-xs">
            <Package className="h-3.5 w-3.5" /> {t("Wrap In")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {canWrapInBox && (
              <ContextMenuItem
                onClick={() => wrapInBlock("Box")}
                className="flex cursor-pointer items-center gap-x-2 px-2 py-1 text-xs hover:bg-accent">
                <BoxIcon className="h-3.5 w-3.5" /> {t("Box")}
              </ContextMenuItem>
            )}
            {canWrapInLink && (
              <ContextMenuItem
                onClick={() => wrapInBlock("Link")}
                className="flex cursor-pointer items-center gap-x-2 px-2 py-1 text-xs hover:bg-accent">
                <Link2Icon className="h-3.5 w-3.5" /> {t("Link")}
              </ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </div>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center gap-x-2 text-xs font-light">
        <Package className="h-3.5 w-3.5" /> {t("Wrap with")}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="isolate w-32 rounded-md border-border text-xs shadow-lg">
          {canWrapInBox && (
            <DropdownMenuItem onClick={() => wrapInBlock("Box")} className="flex items-center gap-x-2 text-xs">
              <BoxIcon className="h-3.5 w-3.5" /> {t("Box")}
            </DropdownMenuItem>
          )}
          {canWrapInLink && (
            <DropdownMenuItem onClick={() => wrapInBlock("Link")} className="flex items-center gap-x-2 text-xs">
              <Link2Icon className="h-3.5 w-3.5" /> {t("Link")}
            </DropdownMenuItem>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
};
