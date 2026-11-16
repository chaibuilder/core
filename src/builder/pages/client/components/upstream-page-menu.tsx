import { ExternalLink, Link2, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useCloneUpstreamPage, useResetToUpstream } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChangePage } from "~/builder/pages/hooks/use-change-page";
import { DropdownMenuItem } from "~/components/ui/dropdown-menu";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { type UpstreamConfirmAction, UpstreamConfirmDialog } from "./upstream-confirm-dialog";

type UpstreamMenuPage = {
  id: string;
  slug: string;
  online?: boolean | null;
  useUpstream?: boolean;
  dynamic?: boolean | null;
};

/**
 * The ⋮ menu items of a page with an upstream page, added to its usual ones: "Duplicate and edit" while it
 * renders the upstream, "Reset" once it has its own copy, and "View live" either way. `dialog` (the
 * confirmation) renders outside the menu, which unmounts when it closes.
 */
export const useUpstreamPageMenu = (page: UpstreamMenuPage): { items: ReactNode; dialog: ReactNode } => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(CHAI_PERMISSIONS["pages:update"]);
  const getLiveUrl = usePagesProp("getLiveUrl", (slug: string) => slug);
  const changePage = useChangePage();
  const { mutate: cloneUpstream } = useCloneUpstreamPage();
  const { mutate: resetToUpstream } = useResetToUpstream();
  const [confirm, setConfirm] = useState<UpstreamConfirmAction | null>(null);

  const items = (
    <>
      {canEdit && page.useUpstream && (
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm("clone");
          }}>
          <Link2 className="size-3" />
          {t("Duplicate and edit")}
        </DropdownMenuItem>
      )}
      {canEdit && !page.useUpstream && (
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm("reset");
          }}>
          <Undo2 className="size-3" />
          {t("Reset")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        className="flex cursor-pointer items-center gap-2"
        // A dynamic page's slug is its parent's path, not a URL of one of its items.
        disabled={!page.online || page.dynamic === true}
        onClick={(e) => {
          e.stopPropagation();
          window.open(getLiveUrl(page.slug || "/"), "_blank");
        }}>
        <ExternalLink className="size-3" />
        {t("View live")}
      </DropdownMenuItem>
    </>
  );

  const dialog = (
    <UpstreamConfirmDialog
      action={confirm}
      onClose={() => setConfirm(null)}
      onConfirm={(action) =>
        action === "clone" ? cloneUpstream(page.id, { onSuccess: () => changePage(page.id) }) : resetToUpstream(page.id)
      }
    />
  );

  return { items, dialog };
};
