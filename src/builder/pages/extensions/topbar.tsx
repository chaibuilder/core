import { ChevronRight } from "lucide-react";
import { mergeClasses } from "~/builder/core/main";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { PageDropdownInHeader } from "~/builder/pages/client/components/page-dropdown-in-header";
import TopbarLeft from "~/builder/pages/client/components/topbar-left";
import TopbarRight from "~/builder/pages/client/components/topbar-right";
import { useChaiActivePage, usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { usePageType } from "~/builder/pages/hooks/project/use-page-types";
import { ChaiSlot } from "~/builder/register-apis";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import PagesManagerTrigger from "../client/components/page-manager/page-manager-trigger";
import { ChaiLanguageSwitcher } from "../client/components/topbar-left";
import { useLanguages } from "~/builder/hooks/use-languages";

export const AddressBar = () => {
  const { isFetching: isFetchingActivePage } = useChaiActivePage();
  const { data: currentPage, isFetching: isFetchingCurrentPage } = usePrimaryPage();
  const pageType = usePageType(currentPage?.pageType);
  const isFetching = isFetchingActivePage || isFetchingCurrentPage;
  const isPagesManagerEnabled = useBuilderProp("flags.pagesManager", true);
  const { languages } = useLanguages();
  const hasMultipleLanguages = languages && languages.length > 0;
  const dynamicPageTypeName = currentPage?.dynamic && typeof pageType?.name === "string" ? pageType.name : null;

  return (
    <div className={`relative flex items-center`}>
      <div className="flex items-center">
        {hasMultipleLanguages && (
          <>
            <ChaiLanguageSwitcher />
            <ChevronRight
              data-testid="pages-manager-chevron"
              className="text-foreground/60 mx-px h-4 w-4 flex-shrink-0"
            />
          </>
        )}
        {/* PagesManagerTrigger */}
        {isPagesManagerEnabled && (
          <div className={mergeClasses("flex h-7 items-center", isFetching && "max-w-0 overflow-hidden opacity-0")}>
            <PagesManagerTrigger />
          </div>
        )}

        {/* ChevronRight */}
        {isPagesManagerEnabled && (
          <ChevronRight
            data-testid="pages-manager-chevron"
            className="text-foreground/60 mx-px h-4 w-4 flex-shrink-0"
          />
        )}

        {dynamicPageTypeName ? (
          <>
            <span
              data-testid="dynamic-page-type-label"
              title={dynamicPageTypeName}
              className="flex h-7 max-w-[150px] items-center truncate px-1 text-xs font-medium">
              {dynamicPageTypeName}
            </span>
            <ChevronRight
              data-testid="dynamic-page-type-chevron"
              className="text-foreground/60 mx-px h-4 w-4 flex-shrink-0"
            />
          </>
        ) : null}

        {/* PageDropdownInHeader */}
        <div className={mergeClasses("flex h-7 items-center", isFetching && "max-w-0 overflow-hidden opacity-0")}>
          <PageDropdownInHeader />
        </div>
      </div>
    </div>
  );
};

export const Topbar = () => {
  return (
    <div className="bg-background grid h-full w-full grid-cols-3 items-center px-2 py-1">
      <div className="flex justify-start">
        <TopbarLeft />
      </div>
      <div className="flex justify-center">
        {/* <CanvasTopBar /> */}
        <AddressBar />
        <ChaiSlot slotId={CHAI_SLOT_IDS.TOPBAR_CENTER} />
      </div>
      <div className="flex items-center justify-end">
        <TopbarRight />
      </div>
    </div>
  );
};
