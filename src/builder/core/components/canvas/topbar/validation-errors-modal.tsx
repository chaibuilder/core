import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StructureError } from "~/builder/hooks/structure-rules";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { SNOOZE_DAY_OPTIONS } from "~/builder/hooks/use-validation-snooze";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

const NO_SNOOZE = "0";

export const ValidationErrorsModal = ({
  isOpen,
  onClose,
  onContinue,
  errors,
  actionLabel,
  showSnooze = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** `snoozeDays` is 0 unless the user picked a "Do not show for" duration. */
  onContinue: (snoozeDays: number) => void;
  errors: StructureError[];
  actionLabel: string;
  showSnooze?: boolean;
}) => {
  const { t } = useTranslation();
  const [snoozeDays, setSnoozeDays] = useState(NO_SNOOZE);

  // The dialog stays mounted between opens, so reset the picker each time it is shown.
  useEffect(() => {
    if (isOpen) setSnoozeDays(NO_SNOOZE);
  }, [isOpen]);
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const gotoPage = useBuilderProp("gotoPage", (_arg: { pageId: string; lang?: string }) => {});
  const { selectedLang, fallbackLang } = useLanguages();

  const errorList = errors.filter((e) => e.severity === "error");
  const warningList = errors.filter((e) => e.severity === "warning");

  const handleNavigateToBlock = (error: StructureError) => {
    if (error.blockId) {
      setSelectedBlockIds([error.blockId]);
      onClose();
    }
  };

  const handleOpenPartial = (error: StructureError) => {
    if (error.partialBlockId) {
      gotoPage({ pageId: error.partialBlockId, lang: selectedLang || fallbackLang });
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
            {t("Page Validation Issues")}
          </DialogTitle>
          <DialogDescription>
            {t("The following issues were found on this page. You can fix them or continue anyway.")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {errorList.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-red-600">
                {t("Errors")} ({errorList.length})
              </h4>
              {errorList.map((error) => (
                <ValidationErrorItem
                  key={error.id}
                  error={error}
                  onNavigate={handleNavigateToBlock}
                  onOpenPartial={handleOpenPartial}
                />
              ))}
            </div>
          )}
          {warningList.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-orange-600">
                {t("Warnings")} ({warningList.length})
              </h4>
              {warningList.map((error) => (
                <ValidationErrorItem
                  key={error.id}
                  error={error}
                  onNavigate={handleNavigateToBlock}
                  onOpenPartial={handleOpenPartial}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:items-center sm:justify-between sm:gap-0">
          {showSnooze ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap text-xs">{t("Do not show for")}</span>
              <Select value={snoozeDays} onValueChange={setSnoozeDays}>
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SNOOZE} className="text-xs">
                    {t("Off")}
                  </SelectItem>
                  {SNOOZE_DAY_OPTIONS.map((days) => (
                    <SelectItem key={days} value={String(days)} className="text-xs">
                      {days} {days > 1 ? t("days") : t("day")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button size="sm" onClick={() => onContinue(showSnooze ? Number(snoozeDays) : 0)}>
              {actionLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ValidationErrorItem = ({
  error,
  onNavigate,
  onOpenPartial,
}: {
  error: StructureError;
  onNavigate: (error: StructureError) => void;
  onOpenPartial: (error: StructureError) => void;
}) => {
  const { t } = useTranslation();
  const { singular } = usePartialTypeLabel();
  const isError = error.severity === "error";
  const isInPartial = !!error.partialBlockId;

  return (
    <div
      className={`rounded p-2 text-xs ${
        isError
          ? "border border-red-200 bg-red-50 text-red-700"
          : "border border-orange-200 bg-orange-50 text-orange-700"
      }`}>
      <div className="mb-1">{error.message}</div>
      <div className="flex items-center gap-2">
        {error.blockId && !isInPartial && (
          <button
            type="button"
            onClick={() => onNavigate(error)}
            className="inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline">
            {t("Go to block")}
          </button>
        )}
        {isInPartial && (
          <button
            type="button"
            onClick={() => onOpenPartial(error)}
            className="inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline">
            <ExternalLink className="h-3 w-3" />
            {t("Open {{name}}", { name: singular })}
          </button>
        )}
      </div>
    </div>
  );
};
