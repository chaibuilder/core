import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "~/components/ui/dropdown-menu";

import { CardStackIcon } from "@radix-ui/react-icons";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { pubsub } from "~/builder/core/pubsub";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePasteBlocks } from "~/builder/hooks/use-paste-blocks";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";

export const PasteAtRootContextMenu = ({
  parentContext,
  setParentContext,
}: {
  parentContext: { x: number; y: number } | null;
  setParentContext: (value: { x: number; y: number } | null) => void;
}) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();

  const { pasteBlocks } = usePasteBlocks();
  const enableCopyToClipboard = useBuilderProp("flags.copyPaste", true);

  // Never probe the clipboard here: Safari and Firefox show a native "Paste" prompt on every read.
  if (!parentContext) return null;

  if (!enableCopyToClipboard) return null;

  return (
    <div className="absolute inset-0">
      <DropdownMenu open={true} onOpenChange={() => setParentContext(null)}>
        <DropdownMenuTrigger className="hidden" />
        <DropdownMenuContent
          className="absolute w-28 p-1 text-xs"
          style={{ top: parentContext.y, left: parentContext.x }}>
          <DropdownMenuLabel>{t("ACTIONS")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
            <DropdownMenuItem
              className="flex items-center gap-x-2 text-xs"
              onClick={() => pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, null)}>
              <PlusIcon className="h-3.5 w-3.5" /> {t("Add block")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="flex items-center gap-x-2 text-xs"
            onClick={() => {
              pasteBlocks("root");
              setParentContext(null);
            }}>
            <CardStackIcon /> {t("Paste")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
