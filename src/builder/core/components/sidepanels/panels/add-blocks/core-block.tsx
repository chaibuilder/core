import { BoxIcon } from "@radix-ui/react-icons";
import { capitalize, has, isFunction, kebabCase } from "lodash-es";
import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { useDragAndDrop, useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { pubsub } from "~/builder/core/pubsub";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { syncChaiBlocksWithDefaultProps } from "~/registry";

export const CoreBlock = ({
  block,
  disabled,
  parentId,
  position,
}: {
  block: any;
  disabled: boolean;
  parentId?: string;
  position?: number;
}) => {
  const { type, icon, label, disabledReason } = block;
  // Use block.disabled if passed (for partial blocks with circular dep check)
  const isDisabled = disabled || block.disabled;
  const { addCoreBlock, addPredefinedBlock } = useAddBlock();
  const addBlockToPage = () => {
    if (has(block, "blocks")) {
      const blocks = isFunction(block.blocks) ? block.blocks() : block.blocks;
      addPredefinedBlock(syncChaiBlocksWithDefaultProps(blocks), parentId || null, position);
    } else {
      addCoreBlock(block, parentId || null, position);
    }
    pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
  };
  const isDragAndDropEnabled = useIsDragAndDropEnabled();

  const { t } = useTranslation();
  const { onDragStart, onDragEnd } = useDragAndDrop();

  return (
    <>
      <Tooltip key={label} delayDuration={1000}>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            disabled={isDisabled}
            onClick={addBlockToPage}
            onDragStart={(ev) => !isDisabled && onDragStart(ev, { ...block, label: label, icon: icon })}
            onDragEnd={onDragEnd}
            draggable={isDragAndDropEnabled && !isDisabled}
            className={`group flex h-fit flex-col items-center justify-center gap-1 py-2 whitespace-normal ${kebabCase(`chai-block-${type}`)}`}>
            {createElement(icon || BoxIcon, {
              className: "w-4 h-4 mx-auto group-hover:scale-95 transition-transform",
              "data-add-core-block-icon": type,
            })}
            <p className="line-clamp-1 max-w-full truncate text-center text-xs leading-tight font-light break-words hyphens-auto">
              {capitalize(t(label || type))}
            </p>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isDisabled && disabledReason ? disabledReason : t(label || type)}</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
};
