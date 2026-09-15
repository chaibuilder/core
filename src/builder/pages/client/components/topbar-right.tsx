import { compact, isEmpty, upperCase } from "lodash-es";
import {
  CheckCircle,
  ChevronDown,
  CirclePlay,
  ExternalLink,
  Eye,
  Palette,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ValidationErrorsModal } from "~/builder/core/components/canvas/topbar/validation-errors-modal";
import { useIsPageLoaded } from "~/builder/hooks/use-is-page-loaded";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSavePage } from "~/builder/hooks/use-save-page";
import { useStructureValidation } from "~/builder/hooks/use-structure-validation";
import { useRightPanel } from "~/builder/hooks/use-theme";
import { useValidationSnooze } from "~/builder/hooks/use-validation-snooze";
import PermissionChecker from "~/builder/pages/client/components/permission-checker";

import { usePublishPages } from "~/builder/pages/hooks/pages/mutations";
import {
  useCurrentActivePage,
  useGetPageFullSlug,
  useGetPagePreviewUrl,
  usePrimaryPage,
} from "~/builder/pages/hooks/pages/use-current-page";
import { useGetUnpublishedPartialBlocks } from "~/builder/pages/hooks/pages/use-get-unpublished-partial-blocks";
import { useIsLanguagePageCreated } from "~/builder/pages/hooks/pages/use-is-languagep-page-created";

import { useUnpublishedWebsiteSettings } from "~/builder/pages/hooks/project/use-unpublished-website-settings";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { throwConfetti } from "~/builder/pages/utils/confetti";
import Tooltip from "~/builder/pages/utils/tooltip";
import { ChaiSlot } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Loading } from "~/components/ui/loader";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { usePageLockStatus } from "~/builder/pages/client/realtime";

const UnpublishPage = lazy(() => import("~/builder/pages/client/components/unpublish-page"));
const TranslationWarningModal = lazy(
  () => import("~/builder/pages/client/components/save-ui-blocks/translation-warning-modal"),
);
const UnpublishedPartialsModal = lazy(
  () => import("~/builder/pages/client/components/save-ui-blocks/unpublished-partials-modal"),
);
const JsonDiffViewer = lazy(() => import("~/builder/pages/client/components/json-diff-viewer"));

const PreviewButton = () => {
  const { t } = useTranslation();
  const previewUrl = useGetPagePreviewUrl();

  return (
    <>
      <Tooltip content={t("Open preview in new tab")} delayDuration={0}>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="icon-sm">
            <CirclePlay className="h-4 w-4" />
          </Button>
        </a>
      </Tooltip>
      <div className="h-4 w-px border-l bg-transparent" />
    </>
  );
};

const ThemeButton = () => {
  const { t } = useTranslation();
  const [rightPanel, setRightPanel] = useRightPanel();
  return (
    <>
      <Tooltip content={t("Theme")} delayDuration={0}>
        <Button
          variant={rightPanel === "theme" ? "outline" : "ghost"}
          size="icon-sm"
          onClick={() => setRightPanel(rightPanel === "theme" ? "block" : "theme")}>
          <Palette className="h-4 w-4" />
        </Button>
      </Tooltip>
      <div className="h-4 w-px border-l bg-transparent" />
    </>
  );
};

const SaveButton = () => {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const { isLocked } = usePageLockStatus();
  const { savePageAsync, saveState } = useSavePage();
  const { errors, hasErrors, hasWarnings } = useStructureValidation();
  const { isSnoozed, snoozeForDays } = useValidationSnooze("save");
  const [showValidationModal, setShowValidationModal] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "UNSAVED") {
        event.preventDefault();
        event.returnValue = false;
      }
    };

    if (saveState === "UNSAVED") {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveState]);

  const performSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await savePageAsync();
    } finally {
      setIsSaving(false);
    }
  }, [savePageAsync, isSaving]);

  const handleSave = useCallback(async () => {
    if ((hasErrors || hasWarnings) && !isSnoozed()) {
      setShowValidationModal(true);
      return;
    }
    await performSave();
  }, [hasErrors, hasWarnings, isSnoozed, performSave]);

  const handleContinueSave = useCallback(
    async (snoozeDays: number) => {
      setShowValidationModal(false);
      snoozeForDays(snoozeDays);
      await performSave();
    },
    [performSave, snoozeForDays],
  );

  const { buttonIcon, buttonClass, tooltipContent }: any = useMemo(() => {
    switch (saveState) {
      case "UNSAVED":
        return {
          tooltipContent: t("Save draft"),
          buttonIcon: <Save className="h-4 w-4" />,
          buttonClass: "bg-accent",
        };
      case "SAVING":
        return {
          tooltipContent: t("Saving"),
          buttonIcon: <Loading className="h-4 w-4" />,
          buttonClass: "",
        };
      case "SAVED":
        return {
          tooltipContent: t("Saved"),
          buttonIcon: <CheckCircle className="h-4 w-4" />,
          buttonClass: "text-success bg-success/10 hover:bg-success/10 hover:text-success",
        };
    }
  }, [saveState, t]);

  if (isLocked) return null;

  return (
    <>
      <Tooltip content={tooltipContent}>
        <Button size="icon-sm" variant="ghost" onClick={handleSave} className={`${buttonClass}`}>
          {buttonIcon}
        </Button>
      </Tooltip>
      <ValidationErrorsModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        onContinue={handleContinueSave}
        errors={errors}
        actionLabel={t("Save anyway")}
        showSnooze
      />
    </>
  );
};

const PublishButton = () => {
  const { t } = useTranslation();
  const { selectedLang } = useLanguages();
  const { data: activePage } = useCurrentActivePage();
  const getUnpublishedPartialBlocks = useGetUnpublishedPartialBlocks();
  const [, setIsHovered] = useState(false);
  const [unpublishPage, setUnpublishPage] = useState(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const { savePageAsync } = useSavePage();
  const [showTranslationWarning, setShowTranslationWarning] = useState(false);
  const { hasUnpublishedSettings, hasUnpublishedTheme, hasUnpublishedDesignToken } = useUnpublishedWebsiteSettings();
  const [showUnpublishedPartialsWarning, setShowUnpublishedPartialsWarning] = useState(false);
  const [unpublishedPartialBlockIds, setUnpublishedPartialBlockIds] = useState<string[]>([]);
  const [unpublishedPartialBlocksInfo, setUnpublishedPartialBlocksInfo] = useState<any[]>([]);
  const [comparePartial, setComparePartial] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const {
    errors: validationErrors,
    hasErrors: hasValidationErrors,
    hasWarnings: hasValidationWarnings,
  } = useStructureValidation();
  const { isSnoozed: isValidationSnoozed, snoozeForDays: snoozeValidationForDays } = useValidationSnooze("publish");
  const [showValidationModal, setShowValidationModal] = useState(false);

  const { data: currentPage } = usePrimaryPage();
  const [isPageLoaded] = useIsPageLoaded();
  const { mutate: publishPage, isPending } = usePublishPages();
  const { needTranslations } = useSavePage();
  // The blocks store is empty until the page has finished loading, so the pre-publish
  // checks (unpublished partials, missing translations, structure validation) would all
  // pass vacuously. Keep publishing unavailable until the page is loaded.
  const isPublishDisabled = isPending || !isPageLoaded || !currentPage?.id;
  const { buttonText, buttonClassName, isPublished, hasUnpublishedChanges } = useMemo(() => {
    const isPublished = currentPage && currentPage?.online;
    const hasUnpublishedChanges = !isEmpty(currentPage?.changes);
    let buttonClassName = isPublished ? "hover:bg-success/80 bg-success" : "";
    let buttonText = isPublished ? t("Published") : t("Publish");

    if (isPublished && hasUnpublishedChanges) {
      buttonClassName = "hover:bg-blue-600 bg-blue-500";
      buttonText = t("Publish");
    }

    return {
      buttonClassName,
      isPublished,
      hasUnpublishedChanges,
      buttonText,
    };
  }, [currentPage, t]);

  const checkAndPublish = useCallback(
    (pages: string[]) => {
      const { ids: unpublishedIds, partialBlocksInfo } = getUnpublishedPartialBlocks();
      if (unpublishedIds.length > 0) {
        setUnpublishedPartialBlockIds(unpublishedIds);
        setUnpublishedPartialBlocksInfo(partialBlocksInfo);
        setShowUnpublishedPartialsWarning(true);
      } else {
        publishPage({ ids: compact(pages) }, { onSuccess: () => throwConfetti("TOP_RIGHT") });
      }
    },
    [getUnpublishedPartialBlocks, publishPage],
  );

  const proceedToPublish = useCallback(() => {
    // Evaluated at publish time: needTranslations() clones and scans every block,
    // which is too heavy to run on each render
    if (needTranslations()) {
      setShowTranslationWarning(true);
      return;
    }
    checkAndPublish([activePage?.id, activePage?.primaryPage]);
  }, [needTranslations, checkAndPublish, activePage]);

  const handlePublishCurrentPage = async () => {
    if ((hasValidationErrors || hasValidationWarnings) && !isValidationSnoozed()) {
      setShowValidationModal(true);
      return;
    }

    proceedToPublish();
  };

  const handleContinuePublish = (snoozeDays: number) => {
    setShowValidationModal(false);
    snoozeValidationForDays(snoozeDays);
    proceedToPublish();
  };

  const performPublishCurrentPage = (partialBlockIds?: string[]) => {
    const pages = [activePage?.id, activePage?.primaryPage, ...(Array.isArray(partialBlockIds) ? partialBlockIds : [])];
    // * Publishing current page and consumed global blocks
    publishPage({ ids: compact(pages) }, { onSuccess: () => throwConfetti("TOP_RIGHT") });
  };

  const handleContinueWithPartials = () => {
    setShowUnpublishedPartialsWarning(false);
    performPublishCurrentPage(unpublishedPartialBlockIds);
    setUnpublishedPartialBlockIds([]);
    setUnpublishedPartialBlocksInfo([]);
  };

  const handleCancelPartials = () => {
    setShowUnpublishedPartialsWarning(false);
    setUnpublishedPartialBlockIds([]);
    setUnpublishedPartialBlocksInfo([]);
  };

  const handleViewPartialChanges = useCallback((partialId: string, partialName: string) => {
    setComparePartial({ id: partialId, name: partialName });
  }, []);

  const handleContinueAnyway = () => {
    setShowTranslationWarning(false);
    checkAndPublish([activePage?.id, activePage?.primaryPage]);
  };

  const handleCancelTranslation = async () => {
    setShowTranslationWarning(false);
    await savePageAsync();
  };

  return (
    <>
      <div className="flex pl-0.5">
        <Button
          size="sm"
          onClick={handlePublishCurrentPage}
          loading={isPending || !isPageLoaded}
          disabled={isPublishDisabled}
          className={`rounded-r-none duration-300 ${buttonClassName}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}>
          {buttonText}
          {selectedLang ? `(${upperCase(selectedLang)})` : ""}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={isPublishDisabled}
              className={`border-border text-foreground relative rounded-l-none border-l-[0.5px] px-1.5 ${hasUnpublishedSettings ? "bg-muted/60 hover:bg-muted/90" : buttonClassName}`}>
              <ChevronDown className="h-3 w-3 text-current" />
              {hasUnpublishedSettings && (
                <span className="bg-warning absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max">
            <DropdownMenuLabel>{t("Page")}</DropdownMenuLabel>
            {isPublished && hasUnpublishedChanges && (
              <DropdownMenuItem onClick={() => setShowCompareModal(true)} className="cursor-pointer text-xs">
                <Eye className="h-3 w-3" />
                {t("View Unpublished changes")}
              </DropdownMenuItem>
            )}
            {!isPublished && (
              <DropdownMenuItem
                disabled={isPending}
                className="cursor-pointer text-xs"
                onClick={() => checkAndPublish([currentPage?.id])}>
                <Send className="mr-0.5 h-3 w-3" />
                {t("Publish")} page
              </DropdownMenuItem>
            )}

            {isPublished && (
              <DropdownMenuItem onClick={() => setUnpublishPage(activePage)} className="cursor-pointer text-xs">
                <TriangleAlert className="mr-0.5 h-3 w-3" />
                {t("Unpublish")} page {selectedLang ? `(${upperCase(selectedLang)})` : ""}
              </DropdownMenuItem>
            )}

            {hasUnpublishedSettings && (
              <>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuLabel>{t("Unpublished website settings")}</DropdownMenuLabel>
              </>
            )}
            {hasUnpublishedTheme && (
              <DropdownMenuItem
                disabled={isPending}
                className="cursor-pointer text-xs"
                onClick={() => publishPage({ ids: ["THEME"] }, { onSuccess: () => throwConfetti("TOP_RIGHT") })}>
                <span className="flex h-full w-full items-center gap-2">
                  <span className="mt-0.5 h-1 w-1 animate-pulse rounded-full bg-orange-500" />
                  {t("Publish")} theme
                </span>
              </DropdownMenuItem>
            )}
            {hasUnpublishedDesignToken && (
              <DropdownMenuItem
                disabled={isPending}
                className="cursor-pointer text-xs"
                onClick={() =>
                  publishPage({ ids: ["DESIGN_TOKENS"] }, { onSuccess: () => throwConfetti("TOP_RIGHT") })
                }>
                <span className="flex h-full w-full items-center gap-2">
                  <span className="mt-0.5 h-1 w-1 animate-pulse rounded-full bg-orange-500" />
                  {t("Publish")} design token
                </span>
              </DropdownMenuItem>
            )}

            <ChaiSlot slotId={CHAI_SLOT_IDS.PUBLISH_MENU_ITEMS} context={{ isPending }} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {unpublishPage && (
        <Suspense>
          <UnpublishPage page={unpublishPage} onClose={() => setUnpublishPage(null)} />
        </Suspense>
      )}
      {showCompareModal && (
        <Suspense>
          <JsonDiffViewer
            open={showCompareModal}
            onOpenChange={setShowCompareModal}
            compare={[
              { label: "live", uid: `live:${currentPage?.id}`, item: {} },
              {
                label: "draft",
                uid: `draft:${currentPage?.id}`,
                item: currentPage,
              },
            ]}
          />
        </Suspense>
      )}

      {showTranslationWarning && (
        <Suspense>
          <TranslationWarningModal
            isOpen={showTranslationWarning}
            onClose={handleCancelTranslation}
            onContinue={handleContinueAnyway}
            isPending={isPending}
          />
        </Suspense>
      )}

      {showUnpublishedPartialsWarning && (
        <Suspense>
          <UnpublishedPartialsModal
            isOpen={showUnpublishedPartialsWarning}
            onClose={handleCancelPartials}
            onContinue={handleContinueWithPartials}
            onViewChanges={handleViewPartialChanges}
            isPending={isPending}
            partialBlocksInfo={unpublishedPartialBlocksInfo}
          />
        </Suspense>
      )}

      {comparePartial && (
        <Suspense>
          <JsonDiffViewer
            open={!!comparePartial}
            onOpenChange={(open) => {
              if (!open) {
                setComparePartial(null);
                setShowUnpublishedPartialsWarning(true);
              }
            }}
            compare={[
              { label: "live", uid: `live:${comparePartial.id}`, item: {} },
              { label: "draft", uid: `draft:${comparePartial.id}`, item: {} },
            ]}
          />
        </Suspense>
      )}

      <ValidationErrorsModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        onContinue={handleContinuePublish}
        errors={validationErrors}
        actionLabel={t("Publish anyway")}
        showSnooze
      />
    </>
  );
};

const LiveLinkButton = () => {
  const { t } = useTranslation();
  const { data: currentPage } = usePrimaryPage();
  const fullUrl = useGetPageFullSlug();
  const isOnline = currentPage?.online;

  if (!isOnline) return null;

  return (
    <Tooltip content={t("Open live page")} delayDuration={0}>
      <a href={fullUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="ghost" size="icon-sm">
          <ExternalLink className="h-4 w-4" />
        </Button>
      </a>
    </Tooltip>
  );
};

export default function TopbarRight() {
  const { isLocked } = usePageLockStatus();
  const [searchParams] = useSearchParams();
  const lang = searchParams.get("lang");
  const isLanguagePageCreated = useIsLanguagePageCreated(lang as string);

  if (isLocked || !isLanguagePageCreated) return <div />;
  return (
    <div className="flex items-center justify-end gap-1">
      <PermissionChecker permission={CHAI_PERMISSIONS["theme:edit"]}>
        <ThemeButton />
      </PermissionChecker>
      <PreviewButton />
      <PermissionChecker permission={CHAI_PERMISSIONS["pages:update"]}>
        <SaveButton />
      </PermissionChecker>
      <PermissionChecker permission={CHAI_PERMISSIONS["pages:publish"]}>
        <PublishButton />
      </PermissionChecker>
      <LiveLinkButton />
      <ChaiSlot slotId={CHAI_SLOT_IDS.TOPBAR_RIGHT} />
    </div>
  );
}
