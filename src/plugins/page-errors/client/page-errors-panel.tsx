import { noop, sortBy } from "lodash-es";
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StructureError } from "~/builder/hooks/structure-rules";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
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
  const { singular: partialTypeLabel } = usePartialTypeLabel();
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

  const groups = groupIssues(errors);

  return (
    <div className="space-y-3">
      <IssueCounts errorCount={errorCount} warningCount={warningCount} />
      {groups.map((group) => (
        <IssueGroupSection
          key={group.partialBlockId ?? ""}
          title={
            group.partialBlockId
              ? `${getPartialBlockName(group.partialBlockId)} (${partialTypeLabel})`
              : t("This page")
          }
          issues={group.issues}
          onGoTo={(issue) => handleGoToBlock(issue.blockId, issue.partialBlockId)}
        />
      ))}
    </div>
  );
};

type IssueGroup = { partialBlockId?: string; issues: StructureError[] };

// Page issues first, then one group per partial/global in first-seen order; errors before warnings.
const groupIssues = (errors: StructureError[]): IssueGroup[] => {
  const groups = new Map<string, IssueGroup>([["", { issues: [] }]]);
  for (const error of errors) {
    const key = error.partialBlockId ?? "";
    if (!groups.has(key)) groups.set(key, { partialBlockId: error.partialBlockId, issues: [] });
    groups.get(key)!.issues.push(error);
  }
  return [...groups.values()]
    .filter((group) => group.issues.length > 0)
    .map((group) => ({ ...group, issues: sortBy(group.issues, (e) => (e.severity === "error" ? 0 : 1)) }));
};

const IssueCounts = ({ errorCount, warningCount }: { errorCount: number; warningCount: number }) => {
  const { t } = useTranslation();
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
      {errorCount > 0 && <span className="text-red-500">{t("{{count}} errors", { count: errorCount })}</span>}
      {errorCount > 0 && warningCount > 0 && <span>·</span>}
      {warningCount > 0 && <span className="text-orange-500">{t("{{count}} warnings", { count: warningCount })}</span>}
    </span>
  );
};

const IssueGroupSection = ({
  title,
  issues,
  onGoTo,
}: {
  title: string;
  issues: StructureError[];
  onGoTo: (issue: StructureError) => void;
}) => {
  const errorCount = issues.filter((e) => e.severity === "error").length;
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold">
        <ChevronRight className="h-3.5 w-3.5 flex-none transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <IssueCounts errorCount={errorCount} warningCount={issues.length - errorCount} />
      </summary>
      <div className="mt-1.5 space-y-1.5">
        {issues.map((issue) => (
          <IssueItem key={issue.id} issue={issue} onClick={() => onGoTo(issue)} />
        ))}
      </div>
    </details>
  );
};

const IssueItem = ({ issue, onClick }: { issue: StructureError; onClick: () => void }) => {
  const { t } = useTranslation();
  const isError = issue.severity === "error";
  return (
    <button
      type="button"
      aria-label={`Navigate to ${issue.severity}: ${issue.message}`}
      className={
        isError
          ? "w-full cursor-pointer rounded-md border border-red-200 bg-red-50 p-2 text-left text-xs transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/50"
          : "w-full cursor-pointer rounded-md border border-orange-200 bg-orange-50 p-2 text-left text-xs transition-colors hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
      }
      onClick={onClick}>
      <div className="space-y-1">
        <p className={isError ? "text-red-600 dark:text-red-300" : "text-orange-600 dark:text-orange-300"}>
          {issue.message}
        </p>
        <span
          className={`flex items-center gap-1 text-[11px] font-semibold ${
            isError ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400"
          }`}>
          {t(isError ? "Goto Error" : "Goto Warning")}
          {issue.partialBlockId ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
        </span>
      </div>
    </button>
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
