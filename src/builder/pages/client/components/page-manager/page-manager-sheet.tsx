import { isEmpty } from "lodash-es";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageManagerAtom } from "~/builder/pages/atom/page-manager";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";

const PagesManagerNew = lazy(() => import("./page-manager-new"));

const PagesManagerSheet = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");
  const { data: primaryPage, isFetching } = usePrimaryPage();
  const { data: allPages, isFetching: isPagesLoading } = useChaiPrimaryPages();
  const [pageManagerOpen, setPageManager] = usePageManagerAtom();
  const canClose = !!page && !isEmpty(primaryPage);

  // Sticky: only the very first pages load counts as "initial". Every later
  // GET_WEBSITE_PAGES refetch (rename, refresh, publish, …) flips `isFetching`
  // again, and deriving this flag from it closed the forced-open sheet mid-flow,
  // unmounted PagesManagerNew (and whatever dialog it had open), then re-opened
  // it once the refetch landed — leaving the builder looking frozen.
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    if (!isPagesLoading && allPages) setIsInitialLoad(false);
  }, [isPagesLoading, allPages]);

  // Open the page manager
  const shouldOpenForMissingPage = !isInitialLoad && !page;
  const shouldOpenForEmptyPage = !isInitialLoad && !isFetching && isEmpty(primaryPage);
  const isOpen = pageManagerOpen || shouldOpenForMissingPage || shouldOpenForEmptyPage;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && canClose && setPageManager(false)}>
      <SheetContent
        side={"left"}
        aria-describedby="pages-manager-description"
        className={`border-border z-50 !max-w-[600px] !min-w-[600px] p-0 ${!canClose ? "sheet-hide-close-btn" : ""}`}>
        <SheetHeader className="p-3 px-4">
          <SheetTitle>{t("Pages Manager")}</SheetTitle>
          <SheetDescription className="sr-only">{t("Manage your site structure")}</SheetDescription>
        </SheetHeader>
        <div className="h-[calc(100vh-80px)] overflow-y-auto">
          {isOpen && (
            <Suspense>
              <PagesManagerNew close={() => setPageManager(false)} />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PagesManagerSheet;
