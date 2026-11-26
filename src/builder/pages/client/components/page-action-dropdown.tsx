import { find } from "lodash-es";
import { Archive, CopyPlusIcon, FileText, Pencil, Power, Trash } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { getTrashLabels } from "~/builder/pages/constants/trash-config";
import { useUpdatePage } from "~/builder/pages/hooks/pages/mutations";
import { usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useUpstreamPagesEnabled } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { CHAI_SLOT_IDS, ChaiSlot } from "~/builder/register-apis";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { useUpstreamPageMenu } from "./upstream-page-menu";

interface PageActionsDropdownProps {
  page: any;
  setDuplicatePage: (page: any) => void;
  setAddEditPage: (page: any) => void;
  setUnpublishPage: (page: any) => void;
  setDeletePage: (page: any) => void;
  children: React.ReactNode;
  isLanguagePage?: boolean;
}

export const PageActionsDropdown = ({
  page,
  setDuplicatePage,
  setAddEditPage,
  setUnpublishPage,
  setDeletePage,
  children,
  isLanguagePage,
}: PageActionsDropdownProps) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;

  const { data: pageTypes } = useChaiPageTypes();
  const pageType = useMemo(() => find(pageTypes, { key: page.pageType }), [pageTypes, page.pageType]);
  const isFolder = page?.pageType === "_folder";
  // The homepage owns "/" — the site needs a root route, so it can only be
  // replaced by promoting another page to "/", never deleted. Language
  // variants live at "/<lang>" and stay deletable.
  const isHomePage = page?.slug === "/" && !page?.primaryPage;
  const { mutate: updatePage } = useUpdatePage();
  const upstreamEnabled = useUpstreamPagesEnabled();
  // A page linked to an upstream page (or cloned from one) adds its upstream items to the usual ones.
  const upstreamMenu = useUpstreamPageMenu(page ?? {});
  const hasUpstream = upstreamEnabled && !isLanguagePage && !!page?.upstream;
  // A linked page has no content of its own, so a duplicate would be an empty page.
  const isLinked = hasUpstream && !!page?.useUpstream;

  const noMoreActions =
    !hasUpstream &&
    !hasPermission(CHAI_PERMISSIONS["pages:update"]) &&
    (isHomePage || !hasPermission(CHAI_PERMISSIONS["pages:delete"])) &&
    !hasPermission(CHAI_PERMISSIONS["pages:unpublish"]);

  if (noMoreActions || !page) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-sm">
          {hasUpstream && upstreamMenu.items}
          {hasPermission(CHAI_PERMISSIONS["pages:create"]) && !isLanguagePage && !isFolder && !isLinked && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setDuplicatePage(page);
              }}>
              <CopyPlusIcon className="size-3" />
              {t("Duplicate page")}
            </DropdownMenuItem>
          )}
          {isFolder && hasPermission(CHAI_PERMISSIONS["pages:change_type"]) && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                updatePage(
                  { id: page.id, pageType: "page" },
                  { onSuccess: () => toast.success(t("Folder converted to page")) },
                );
              }}>
              <FileText className="size-3" />
              {t("Convert to page")}
            </DropdownMenuItem>
          )}
          {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setAddEditPage({
                  ...page,
                  global: !pageType?.hasSlug,
                });
              }}>
              <Pencil className="size-3" />
              {t("Edit")}
            </DropdownMenuItem>
          )}
          {page?.online && hasPermission(CHAI_PERMISSIONS["pages:unpublish"]) && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setUnpublishPage(page);
              }}>
              <Power className="size-3" />
              {t("Unpublish")}
            </DropdownMenuItem>
          )}
          {hasPermission(CHAI_PERMISSIONS["pages:delete"]) && !isHomePage && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setDeletePage(page);
              }}>
              {flags?.trash ? (
                <>
                  <Archive className="size-3" />
                  {t(getTrashLabels().sidebarButton)}
                </>
              ) : (
                <>
                  <Trash className="size-3" />
                  {t("Delete")}
                </>
              )}
            </DropdownMenuItem>
          )}
          <ChaiSlot slotId={CHAI_SLOT_IDS.AFTER_PAGE_MORE_OPTIONS} context={{ page }} />
          {/* HIDDEN: Mark as template feature 
        {hasPermission(PAGES_PERMISSIONS.MARK_AS_TEMPLATE) && hasSlug && !isLanguagePage && (
          <>
            {isTemplate ? (
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setUnmarkAsTemplate(page);
                }}>
                <SquareLibrary className="size-3" />
                {t("Unmark as template")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setMarkAsTemplate(page);
                }}>
                <SquareLibrary className="size-3" />
                {t("Mark as template")}
              </DropdownMenuItem>
            )}
          </>
        )}
        */}
        </DropdownMenuContent>
      </DropdownMenu>
      {hasUpstream && upstreamMenu.dialog}
    </>
  );
};
