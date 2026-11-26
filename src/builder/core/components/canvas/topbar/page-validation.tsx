import { ExclamationTriangleIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useStructureValidation } from "~/builder/hooks/use-structure-validation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";

export const PageValidation = () => {
  const { hasErrors, hasWarnings, errorCount, warningCount, errors } = useStructureValidation();
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const { t } = useTranslation();

  if (!hasErrors && !hasWarnings) {
    return null;
  }

  const getSeverityColor = () => {
    if (hasErrors) return "text-red-500";
    if (hasWarnings) return "text-orange-500";
    return "text-gray-500";
  };

  const getIcon = () => {
    if (hasErrors) return <ExclamationTriangleIcon className="h-4 w-4" />;
    if (hasWarnings) return <InfoCircledIcon className="h-4 w-4" />;
    return null;
  };

  const getMessage = () => {
    if (hasErrors && hasWarnings) {
      return `${t("{{count}} errors", { count: errorCount })}, ${t("{{count}} warnings", { count: warningCount })}`;
    }
    if (hasErrors) {
      return t("{{count}} errors", { count: errorCount });
    }
    if (hasWarnings) {
      return t("{{count}} warnings", { count: warningCount });
    }
    return "";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className={`ml-2 flex cursor-pointer items-center gap-2 ${getSeverityColor()}`}>
          {getIcon()}
          <span className="text-xs font-medium">{getMessage()}</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" className="max-w-xs p-2" align="end">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t("Invalid structure")}</h4>

          {errors.length === 0 ? (
            <p className="text-xs">{t("No validation issues found.")}</p>
          ) : (
            <div className="space-y-1">
              {errors.slice(0, 5).map((error) => (
                <div
                  key={error.id}
                  onClick={() => {
                    if (error.blockId) {
                      setSelectedBlockIds([error.blockId]);
                    }
                  }}
                  className={`cursor-pointer rounded p-2 text-xs transition-opacity hover:opacity-80 ${
                    error.severity === "error"
                      ? "border border-red-200 bg-red-50 text-red-700"
                      : "border border-orange-200 bg-orange-50 text-orange-700"
                  }`}>
                  <div className="font-medium">{error.severity === "error" ? t("Error:") : t("Warning:")}</div>
                  <div>{error.message}</div>
                </div>
              ))}

              {errors.length > 5 && (
                <p className="text-xs italic text-gray-500">
                  {t("... and {{count}} more issues", { count: errors.length - 5 })}
                </p>
              )}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
