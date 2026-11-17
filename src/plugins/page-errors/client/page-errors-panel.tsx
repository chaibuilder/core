import { noop } from "lodash-es";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePartialBlocksList } from "~/builder/hooks/use-partial-blocks-store";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useStructureValidation } from "~/builder/hooks/use-structure-validation";
import { Button } from "~/components/ui/button";

export const pageErrorsPanelId = "page-errors";

const ErrorsButton = ({ isActive, show }: { isActive: boolean; show: () => void }) => {
  const { errorCount, warningCount } = useStructureValidation();
  const totalCount = errorCount + warningCount;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={show}
      className={`relative h-8 w-8 ${isActive ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`}>
      <AlertTriangle className="h-5 w-5" />
      {totalCount > 0 && (
        <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
          {totalCount > 99 ? "99+" : totalCount}
        </span>
      )}
    </Button>
  );
};

const ErrorsPanel = () => {
  const { errors, errorCount, warningCount } = useStructureValidation();
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const gotoPage = useBuilderProp("gotoPage", noop);
  const { saveState, savePageAsync } = useChaiSavePage();
  const { selectedLang, fallbackLang } = useLanguages();
  const { data: partialBlocksList } = usePartialBlocksList();
  const { t } = useTranslation();

  // Human-readable name of the partial/global block an error lives in.
  const getPartialBlockName = (partialBlockId?: string) =>
    partialBlockId ? partialBlocksList[partialBlockId]?.name || partialBlockId : t("this page");

  const handleGoToBlock = async (blockId?: string, partialBlockId?: string) => {
    if (partialBlockId) {
      // Navigating into a partial/global requires the current page to be
      // persisted first, otherwise the destination loads stale blocks.
      if (saveState !== "SAVED") {
        await savePageAsync();
      }
      // Carry the errored block id so it is selected once the partial/global loads.
      gotoPage({ pageId: partialBlockId, lang: selectedLang || fallbackLang, blockId });
      return;
    }
    if (blockId) {
      setSelectedBlockIds([blockId]);
    }
  };

  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <p className="text-sm font-medium">{t("No issues found")}</p>
          <p className="text-muted-foreground text-xs">{t("This page has no validation errors or warnings.")}</p>
        </div>
      </div>
    );
  }

  const errorsList = errors.filter((e) => e.severity === "error");
  const warningsList = errors.filter((e) => e.severity === "warning");

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {errorCount > 0 && (
          <span className="text-red-500">
            {errorCount} {t(errorCount === 1 ? "error" : "errors")}
          </span>
        )}
        {errorCount > 0 && warningCount > 0 && <span>·</span>}
        {warningCount > 0 && (
          <span className="text-orange-500">
            {warningCount} {t(warningCount === 1 ? "warning" : "warnings")}
          </span>
        )}
      </div>

      {errorsList.length > 0 && (
        <div className="space-y-1.5">
          {errorsList.map((error) => (
            <button
              type="button"
              key={error.id}
              aria-label={`Navigate to error: ${error.message}`}
              className="w-full cursor-pointer rounded-md border border-red-200 bg-red-50 p-2 text-left text-xs transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/50"
              onClick={() => handleGoToBlock(error.blockId, error.partialBlockId)}>
              <div className="space-y-1">
                <div className="font-medium text-red-700 dark:text-red-400">
                  {t("Error on")} {getPartialBlockName(error.partialBlockId)}
                </div>
                <p className="text-red-600 dark:text-red-300">{error.message}</p>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500 dark:text-red-400">
                  {t("Goto Error")}
                  {error.partialBlockId ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {warningsList.length > 0 && (
        <div className="space-y-1.5">
          {warningsList.map((warning) => (
            <button
              type="button"
              key={warning.id}
              aria-label={`Navigate to warning: ${warning.message}`}
              className="w-full cursor-pointer rounded-md border border-orange-200 bg-orange-50 p-2 text-left text-xs transition-colors hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
              onClick={() => handleGoToBlock(warning.blockId, warning.partialBlockId)}>
              <div className="space-y-1">
                <div className="font-medium text-orange-700 dark:text-orange-400">
                  {t("Warning on")} {getPartialBlockName(warning.partialBlockId)}
                </div>
                <p className="text-orange-600 dark:text-orange-300">{warning.message}</p>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-500 dark:text-orange-400">
                  {t("Goto Warning")}
                  {warning.partialBlockId ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const pageErrorsPanel = {
  id: pageErrorsPanelId,
  label: "Errors",
  panel: ErrorsPanel,
  button: ErrorsButton,
  position: "top" as const,
  width: 280,
  view: "standard" as const,
};
