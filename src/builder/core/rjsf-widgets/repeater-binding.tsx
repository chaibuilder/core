import { Cross1Icon, FileIcon, IdCardIcon } from "@radix-ui/react-icons";
import { WidgetProps } from "@rjsf/utils";
import { find, upperFirst } from "lodash-es";
import { useTranslation } from "react-i18next";
import { useRepeaterSource } from "~/builder/core/rjsf-widgets/repeater-data/use-repeater-source";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";
import type { ChaiCollection } from "~/types/deprecated";

export const RepeaterBindingWidget = ({ value, onChange }: WidgetProps) => {
  const { t } = useTranslation();
  const source = useRepeaterSource();
  const collections = useBuilderProp<ChaiCollection[]>("collections", []);

  if (!value) {
    return (
      <div className="border-input bg-muted/50 text-muted-foreground mt-1 flex h-8 items-center gap-2 rounded-md border px-2 py-1 text-xs">
        <FileIcon className="h-3.5 w-3.5" /> {t("Choose a data source")}
      </div>
    );
  }

  const prefixWithBracket = `{{${COLLECTION_PREFIX}`;
  const isCollection = value?.startsWith(prefixWithBracket);
  let displayValue = value;
  if (isCollection) {
    if (source.kind === "repeaterData") {
      displayValue = upperFirst(source.definition.name);
    } else {
      // Legacy collection bindings store only the id; show its name when it still exists.
      const collectionId = value?.replace(prefixWithBracket, "")?.replace("}}", "");
      displayValue = find(collections, { id: collectionId })?.name ?? collectionId;
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
        <span className="flex max-w-[200px] items-center gap-2">
          {" "}
          {isCollection ? <IdCardIcon className="h-3 min-h-3 w-3 min-w-3" /> : null}
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <span className="cursor-default truncate">{displayValue}</span>
            </TooltipTrigger>
            <TooltipContent side="left" hidden={displayValue.length < 50}>
              {displayValue}
            </TooltipContent>
          </Tooltip>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full bg-gray-200 text-gray-900 hover:bg-gray-300"
              onClick={() => onChange("")}>
              <Cross1Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("Remove binding")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
