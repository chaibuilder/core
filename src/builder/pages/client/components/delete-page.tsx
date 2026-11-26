import { get, isEmpty } from "lodash-es";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { getTrashLabels } from "~/builder/pages/constants/trash-config";
import { useDeletePage } from "~/builder/pages/hooks/pages/mutations";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useSiteWideUsage } from "~/builder/pages/hooks/use-site-wide-usage";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { ChaiPage } from "~/builder/pages/utils/page-organization";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

const PARTIAL_PAGES_PREVIEW = 5;

// Helper function to recursively count all child pages
const countAllChildren = (pageId: string, allPages: ChaiPage[]): number => {
  const children = allPages.filter((p) => p.parent === pageId);
  if (children.length === 0) return 0;

  let count = children.length;
  children.forEach((child) => {
    count += countAllChildren(child.id, allPages);
  });

  return count;
};

function DeletePage({ page, onClose }: { page: any; onClose: () => void }) {
  const { t } = useTranslation();
  const { singular } = usePartialTypeLabel();
  const [, setQueryParams] = useSearchParams();
  const { mutate: deletePage, isPending: isDeleting } = useDeletePage();
  const { data: allPages = [] } = useChaiPrimaryPages();
  const { setSelectedLang, fallbackLang } = useLanguages();
  const [, setActivePanel] = useSidebarActivePanel();
  const isPrimaryPage = !page?.primaryPage;
  const { data: languagePages = [] } = useChaiLanguagePages(isPrimaryPage ? page?.id : undefined);
  const { data: siteWideUsage } = useSiteWideUsage();
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;

  const [showAllPages, setShowAllPages] = useState(false);

  const isPartial = useMemo(() => isEmpty(page?.slug), [page?.slug]);

  const pagesUsingPartial = useMemo(() => {
    if (!isPartial || !page?.id || !siteWideUsage) return [];

    const affectedPages: { id: string; name: string }[] = [];
    Object.entries(siteWideUsage).forEach(([pageId, usage]) => {
      if (usage.partialBlocks.includes(page.id) && !usage.isPartial) {
        affectedPages.push({ id: pageId, name: usage.name });
      }
    });

    return affectedPages;
  }, [isPartial, page.id, siteWideUsage]);

  const languagePagesCount = useMemo(() => {
    if (!isPrimaryPage || !languagePages) return 0;
    return languagePages.filter((lp: any) => lp.id !== page.id).length;
  }, [isPrimaryPage, languagePages, page.id]);

  const childPageCount = useMemo(() => {
    if (!page?.id || !allPages.length) return 0;

    let totalChildren = countAllChildren(page.id, allPages);

    if (isPrimaryPage && languagePages && languagePages.length > 0) {
      languagePages.forEach((langPage: any) => {
        if (langPage.id !== page.id) {
          totalChildren += countAllChildren(langPage.id, allPages);
        }
      });
    }

    return totalChildren;
  }, [page.id, allPages, isPrimaryPage, languagePages]);

  const handleDelete = () => {
    if (isDeleting) return;
    deletePage(page, {
      onSuccess: () => {
        if (!page?.primaryPage) {
          window.history.replaceState({}, "", window.location.pathname);
          setQueryParams(new URLSearchParams());
        } else {
          window.history.replaceState({}, "", `/?page=${page.primaryPage}`);
          setQueryParams(new URLSearchParams({ page: page.primaryPage }));
        }
        window.dispatchEvent(new PopStateEvent("popstate"));
        setSelectedLang(fallbackLang);
        setActivePanel("outline");
        onClose();
      },
    });
  };

  return (
    <Dialog open={!!page} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{flags?.trash ? t(getTrashLabels().confirmMoveTitle) : t("Delete Page")}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md">
          <div className="text-foreground/90 mb-2 text-sm font-light">
            {flags?.trash ? t("Are you sure you want to move") : t("Are you sure you want to delete")}{" "}
            <b>{page?.name ?? page?.slug}</b> {flags?.trash ? t("to archive?") : t("? This action cannot be undone.")}
          </div>

          {/* Warning for primary page with language pages or nested children */}
          {isPrimaryPage && (languagePagesCount > 0 || childPageCount > 0) && (
            <div className="mt-3 rounded-md border p-3 text-sm">
              <div className="text-destructive font-semibold">
                {flags?.trash
                  ? getTrashLabels().warning === "Archiving"
                    ? t("Warning: Archiving this primary page will also remove")
                    : t("Warning: Trashing this primary page will also remove")
                  : t("Warning: Deleting this primary page will also remove")}
                :
              </div>
              <ul className="text-destructive mt-2 list-inside list-disc space-y-1">
                {childPageCount > 0 && (
                  <li>{t("{{count}} nested child pages", { count: childPageCount })}</li>
                )}
                {languagePagesCount > 0 && <li>{t("All associated language pages")}</li>}
              </ul>
            </div>
          )}

          {/* Warning for partial being used in pages */}
          {isPartial && pagesUsingPartial.length > 0 && (
            <div className="bg-destructive/10 mt-3 rounded-md p-3 text-sm">
              <div className="text-destructive font-semibold">
                {t("Warning: This {{name}} is currently used in the following pages", { name: singular })}:
              </div>
              <ul
                className={cn(
                  "text-destructive mt-2 list-inside list-disc space-y-1",
                  showAllPages && "max-h-48 overflow-y-auto",
                )}>
                {(showAllPages ? pagesUsingPartial : pagesUsingPartial.slice(0, PARTIAL_PAGES_PREVIEW)).map(({ id, name }) => (
                  <li key={id}>
                    <span className="font-medium">{name}</span>
                  </li>
                ))}
              </ul>
              {!showAllPages && pagesUsingPartial.length > PARTIAL_PAGES_PREVIEW && (
                <Button variant="link" size="sm" onClick={() => setShowAllPages(true)}>
                  {t("Show more")} ({pagesUsingPartial.length})
                </Button>
              )}
            </div>
          )}
          {page.lang && (
            <div className="text-foreground py-2 text-sm font-light">
              {t("Language")}: <span className="font-medium">{get(LANGUAGES, page.lang, page.lang)}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            {t("Cancel")}
          </Button>
          <Button loading={isDeleting} variant="destructive" onClick={handleDelete}>
            {flags?.trash ? t(getTrashLabels().moveToAction) : t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeletePage;
