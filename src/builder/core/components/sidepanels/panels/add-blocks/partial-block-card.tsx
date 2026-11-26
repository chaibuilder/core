import { capitalize } from "lodash-es";
import { Hash, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDragAndDrop, useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { mergeClasses } from "~/builder/core/main";
import { pubsub } from "~/builder/core/pubsub";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";

/**
 * A single partial block rendered as a full-width row.
 *
 * The row has a fixed height and shows a hash icon (to denote a partial), the
 * partial's label and a single truncated line of its description. When a partial
 * has a description an info button is shown at the end of the row; clicking it
 * opens a popover with the full description. When a partial has no description
 * the row simply reads as a plain block.
 */
export const PartialBlockCard = ({
  block,
  parentId,
  position,
  disabled,
}: {
  block: any;
  parentId?: string;
  position?: number;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  const { label, type, description, disabledReason } = block;
  const isDisabled = disabled || block.disabled;
  const hasDescription = Boolean(description && description.trim());

  const { addCoreBlock } = useAddBlock();
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const { onDragStart, onDragEnd } = useDragAndDrop();

  const addBlockToPage = () => {
    if (isDisabled) return;
    if (addCoreBlock(block, parentId || null, position)) pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
  };

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      onClick={addBlockToPage}
      onKeyDown={(ev) => {
        if (isDisabled) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          addBlockToPage();
        }
      }}
      onDragStart={(ev) => !isDisabled && onDragStart(ev, { ...block, label, icon: Hash })}
      onDragEnd={onDragEnd}
      draggable={isDragAndDropEnabled && !isDisabled}
      title={isDisabled && disabledReason ? disabledReason : undefined}
      className={mergeClasses(
        "flex h-12 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent",
        isDisabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-background",
      )}>
      <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight text-foreground">
          {capitalize(t(label || type))}
        </p>
        {hasDescription ? (
          <p className="truncate text-[11px] font-light leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {hasDescription ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                onClick={(ev) => ev.stopPropagation()}
                aria-label={t("View description")}
                className="shrink-0 rounded p-1 text-muted-foreground outline-none hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="max-w-64">
              <p className="text-xs font-medium leading-tight text-popover-foreground">
                {capitalize(t(label || type))}
              </p>
              <p className="mt-1 whitespace-pre-wrap font-light leading-snug text-muted-foreground">{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
};
