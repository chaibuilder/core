import { Edit, FileText, Globe, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";

interface ContextDisplayBarProps {
  onRemove: () => void;
  onManageContext: (type?: "site" | "page") => void;
  isLoading?: boolean;
}

export const ContextDisplayBar = ({ onRemove, onManageContext, isLoading = false }: ContextDisplayBarProps) => {
  const { t } = useTranslation();
  const selectedBlock = useSelectedBlock();
  const blockType = selectedBlock?._type || "Unknown";
  const blockName = selectedBlock?._name || blockType;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative mx-auto w-[95%] pb-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      {/* Stacked cards container */}
      <div className="relative -mb-1 pt-2">
        {/* Block Context - Front layer (always visible) */}
        <div className="relative transition-all duration-300 ease-out" style={{ zIndex: 3 }}>
          <div className="bg-surface flex items-center justify-between rounded-t-lg border border-b-0 border-border px-3 py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
                @
              </div>
              <span className="truncate text-[11px] text-foreground">
                {!selectedBlock ? t("Entire Page") : blockName}
              </span>
            </div>
            {selectedBlock && (
              <Tooltip content={t("Remove block from context")} side="right">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onRemove}
                  disabled={isLoading}
                  title={t("Remove block from context")}>
                  <X className="!h-3 !w-3" />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Page Context - Middle layer */}
        <div
          className={`absolute left-0 right-0 transition-all duration-300 ease-out ${
            isHovered ? "-top-6 scale-100" : "top-px scale-[0.97]"
          }`}
          style={{ zIndex: 2 }}>
          <div className="bg-surface flex items-center justify-between rounded-t-lg border border-border px-3 pb-1.5 pt-1 shadow-sm">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-semibold text-foreground">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <span className="truncate text-[11px] text-foreground">{t("Page context")}</span>
            </div>
            <Tooltip content={t("Edit page context")} side="right">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onManageContext("page")}
                disabled={isLoading}
                tabIndex={isHovered ? 0 : -1}
                aria-hidden={!isHovered}>
                <Edit className="!h-3.5 !w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Site Context - Back layer */}
        <div
          className={`absolute left-0 right-0 transition-all duration-300 ease-out ${
            isHovered ? "-top-14 scale-100" : "-top-[6px] scale-[0.94]"
          }`}
          style={{ zIndex: 1 }}>
          <div className="bg-surface flex items-center justify-between rounded-t-lg border border-border px-3 pb-1.5 pt-1 shadow-sm">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-semibold text-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <span className="truncate text-[11px] text-foreground">{t("Website context")}</span>
            </div>
            <Tooltip content={t("Edit website context")} side="right">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onManageContext("site")}
                disabled={isLoading}
                tabIndex={isHovered ? 0 : -1}
                aria-hidden={!isHovered}>
                <Edit className="!h-3.5 !w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
