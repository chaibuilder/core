import React from "react";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { Button } from "~/components/ui/button";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "~/builder/pages/utils/tooltip";

interface SelectedBlockDisplayProps {
  onRemove: () => void;
  isLoading?: boolean;
}

export const SelectedBlockDisplay = ({ onRemove, isLoading = false }: SelectedBlockDisplayProps) => {
  const { t } = useTranslation();
  const selectedBlock = useSelectedBlock();
  const blockType = selectedBlock?._type || "Unknown";
  const blockName = selectedBlock?._name || blockType;

  return (
    <div className="relative mx-auto w-[95%]">
      {/* Block Context - Front layer (always visible) */}
      <div className="relative transition-all duration-300 ease-out" style={{ zIndex: 3 }}>
        <div className="bg-surface flex items-center justify-between rounded-t-lg border border-b-0 border-border px-3 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
              @
            </div>
            <span className="truncate text-[11px] leading-none text-foreground">
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
    </div>
  );
};
