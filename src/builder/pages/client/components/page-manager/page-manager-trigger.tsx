import { Files } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePartialTabLabel } from "~/builder/hooks/use-create-partial-label";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { PAGE_CATEGORY_FILTER_KEY, useSetPageManagerAtom } from "~/builder/pages/atom/page-manager";
import { useChaiPageLockStatus } from "~/builder/pages/client/realtime";
import { useIsPublishing } from "~/builder/pages/hooks/pages/mutations";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";

const PagesManagerTrigger = ({ children }: { children?: React.ReactNode }) => {
  const { t } = useTranslation();
  const setPageManager = useSetPageManagerAtom();
  const { savePage } = useChaiSavePage();
  const { isLocked } = useChaiPageLockStatus();
  // Publishing saves the current page first, so switching away mid-publish would
  // save and publish the wrong blocks. The manager is the only way to pick another
  // page, and its sheet is modal, so blocking it here keeps the list unreachable.
  const isPublishing = useIsPublishing();
  const { data: currentPage } = usePrimaryPage();
  const { data: pageTypes } = useChaiPageTypes();
  const partialTabLabel = usePartialTabLabel();
  const pageType = pageTypes?.find((type) => type.key === currentPage?.pageType);
  const isPartialOpen = pageType?.hasSlug === false && pageType.key !== "_layout";

  return (
    <Tooltip
      content={isPublishing ? t("Publishing…") : t("Open pages manager")}
      onClick={() => {
        if (isPublishing) return;
        if (!isLocked) savePage();
        if (isPartialOpen) sessionStorage.setItem(PAGE_CATEGORY_FILTER_KEY, "partials");
        setPageManager(true);
      }}>
      {children || (
        <Button variant="ghost" size="sm" disabled={isPublishing}>
          <Files />
          {isPartialOpen ? partialTabLabel : t("Pages")}
        </Button>
      )}
    </Tooltip>
  );
};

export default PagesManagerTrigger;
