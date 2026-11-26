"use client";

import { Check, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "~/builder/pages/components/ai-elements/model-selector";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";
import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { AIModel, useAIModels } from "./ai-models-context";

interface ModelSelectorDropdownProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  /** Light-theme the portaled dropdown/tooltips -- for triggers on a light surface (e.g. the white floating composer). */
  forceLight?: boolean;
  /** Tighter scale without the per-row tooltip -- for the block floating prompt's small composer. */
  compact?: boolean;
}

export const ModelSelectorDropdown = ({
  selectedModel,
  onModelChange,
  disabled = false,
  forceLight = false,
  compact = false,
}: ModelSelectorDropdownProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Closing the popover returns focus to the trigger, whose tooltip opens on
  // focus -- suppress it briefly so picking a model doesn't re-show the name.
  const [suppressTriggerTooltip, setSuppressTriggerTooltip] = useState(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    },
    [],
  );
  const { models } = useAIModels();

  const currentModel = models.find((model: AIModel) => model.id === selectedModel) || models[0];

  const groupedModels = models.reduce(
    (acc: Record<string, AIModel[]>, model: AIModel) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, AIModel[]>,
  );

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setOpen(false);
    setSuppressTriggerTooltip(true);
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressTimerRef.current = null;
      setSuppressTriggerTooltip(false);
    }, 400);
  };

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <RadixTooltip open={suppressTriggerTooltip ? false : undefined}>
          <TooltipTrigger asChild>
            <ModelSelectorTrigger asChild className="bg-transparent">
              <Button
                variant="outline"
                size="xs"
                disabled={disabled}
                className={cn(
                  "h-[22px] max-w-[120px] gap-1 px-2 font-light aria-expanded:bg-accent aria-expanded:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
                  forceLight &&
                    "border-gray-300 border-[0.5px] bg-white text-black hover:bg-gray-100 hover:text-black! aria-expanded:bg-gray-100! aria-expanded:text-black! data-[state=open]:bg-gray-100! data-[state=open]:text-black!",
                )}>
                <Cpu className="!h-3 !w-3" />
                <span className="max-w-20 truncate text-[11px]">{currentModel.name}</span>
              </Button>
            </ModelSelectorTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className={cn(forceLight && "chai-light-scope")}>
            <p>{currentModel.name}</p>
          </TooltipContent>
        </RadixTooltip>
      </TooltipProvider>

      <ModelSelectorContent
        className={cn(
          compact ? "w-56" : "max-w-72",
          "p-0",
          forceLight &&
            "chai-light-scope border-gray-200 bg-white text-black [&_[data-cmdk-root]]:bg-white [&_[data-cmdk-root]]:text-black",
        )}
        align="start">
        <h3
          className={cn(
            "font-medium",
            forceLight && "text-black",
            compact ? "px-2.5 pb-0.5 pt-2 text-[11px]" : "px-3 pb-0 pt-2 text-xs",
          )}>
          {t("Models")}
        </h3>
        {/* Always scrollable: CommandList has overflow-y-auto by default but no
            height cap, so without max-h it just grows past the viewport instead
            of ever showing a scrollbar. */}
        <ModelSelectorList className={cn("no-scrollbar overflow-y-auto", compact ? "max-h-64" : "max-h-80")}>
          {Object.entries(groupedModels).map(([provider, models]) => (
            <ModelSelectorGroup
              key={provider}
              heading={provider.charAt(0).toUpperCase() + provider.slice(1)}
              className={cn(
                forceLight && "text-black [&_[cmdk-group-heading]]:text-gray-600",
                compact && "[&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]",
              )}>
              {(models as AIModel[]).map((model) =>
                compact ? (
                  <ModelSelectorItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => handleModelSelect(model.id)}
                    className={cn(
                      "relative flex cursor-pointer items-center gap-1.5 py-1",
                      forceLight
                        ? selectedModel === model.id
                          ? "bg-gray-200 text-black"
                          : "text-black hover:bg-gray-100"
                        : selectedModel === model.id
                          ? "bg-accent"
                          : "hover:bg-accent/50",
                    )}>
                    {selectedModel === model.id ? (
                      <Check
                        className={cn(
                          "size-4 shrink-0 rounded-full stroke-[4px] p-0.5",
                          forceLight ? "bg-blue-500 text-white" : "bg-primary text-primary-foreground",
                        )}
                      />
                    ) : (
                      <ModelSelectorLogo
                        provider={model.provider}
                        className={cn(
                          "size-4 shrink-0 rounded-full p-0.5 dark:bg-gray-500",
                          forceLight ? "bg-white" : "bg-background",
                        )}
                      />
                    )}
                    <div className="flex w-full min-w-0 items-center justify-between gap-1">
                      <ModelSelectorName className="truncate text-[11px] leading-none">
                        {model.name}
                      </ModelSelectorName>
                      {model?.multiplier > 0 ? (
                        <div className="shrink-0 text-[10px] italic text-muted-foreground">{model?.multiplier}x</div>
                      ) : null}
                    </div>
                  </ModelSelectorItem>
                ) : (
                  <ModelSelectorItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => handleModelSelect(model.id)}
                    className={cn(
                      "relative flex cursor-pointer items-start pb-1 pt-1.5",
                      forceLight
                        ? selectedModel === model.id
                          ? "bg-gray-200 text-black"
                          : "text-black hover:bg-gray-100"
                        : selectedModel === model.id
                          ? "bg-accent"
                          : "hover:bg-accent/50",
                    )}>
                    {selectedModel === model.id ? (
                      <Check
                        className={cn(
                          "mt-0.5 size-5 rounded-full stroke-[4px] p-0.5",
                          forceLight ? "bg-blue-500 text-white" : "bg-primary text-primary-foreground",
                        )}
                      />
                    ) : (
                      <ModelSelectorLogo provider={model.provider} className={forceLight ? "bg-white" : undefined} />
                    )}

                    <Tooltip
                      content={
                        <>
                          <b>{model.name}</b>: {model.description}
                        </>
                      }
                      side="top"
                      align="start"
                      className={cn("w-44", forceLight && "chai-light-scope")}>
                      <div className="flex w-full flex-col">
                        <div className="flex w-full items-center justify-between">
                          <ModelSelectorName className="text-xs leading-none">{model.name}</ModelSelectorName>
                          {model?.multiplier > 0 ? (
                            <div className="text-[10px] italic text-muted-foreground">
                              {t("{{count}}x Credits", { count: model?.multiplier })}
                            </div>
                          ) : null}
                        </div>
                        <div className="line-clamp-1 text-[10px] italic leading-4 text-muted-foreground">
                          {model.description}
                        </div>
                      </div>
                    </Tooltip>
                  </ModelSelectorItem>
                ),
              )}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
};
