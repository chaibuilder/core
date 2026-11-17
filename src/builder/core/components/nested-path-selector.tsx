import { t } from "i18next";
import React from "react";
import { PathDropdown } from "~/builder/core/components/binding-popup/path-dropdown";
import { type BindingValueType } from "~/builder/core/components/binding-popup/binding-options";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useChaiCollections } from "~/builder/hooks/use-chai-collections";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";

type NestedPathSelectorProps = {
  data: Record<string, any>;
  onSelect: (path: string, type: BindingValueType) => void;
  dataType?: BindingValueType;
  repeaterKey?: string;
  /** List collection/repeater-data sources as array options. Default true. */
  withCollections?: boolean;
  /** List only repeater-data sources with a detailed `fetchItem` (Collection Item picker). */
  requireFetchItem?: boolean;
  disabled?: boolean;
};

/**
 * The single data-binding popup: "Add field" trigger + searchable, drillable key
 * list with truncated value previews. Used by settings-panel fields, the RTE
 * modal, attribute editor, repeater filters, SEO panel and the JSON-LD editor.
 */
export function ChaiNestedPathSelector({
  data,
  onSelect,
  dataType = "value",
  repeaterKey,
  withCollections = true,
  requireFetchItem,
  disabled = false,
}: NestedPathSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const collections = useBuilderProp("collections", []) as { id: string }[];
  const repeaterData = useChaiCollections() as { id: string; hasFetchItem?: boolean }[];

  const pageData = React.useMemo(() => {
    if (dataType === "array" && withCollections) {
      const repeaterDataKeys = repeaterData.filter((r) => !requireFetchItem || r.hasFetchItem).map((r) => r.id);
      // legacy collections stay listed only while registered and not shadowed
      // by a repeater-data source with the same id; they never have fetchItem
      const legacyKeys = requireFetchItem
        ? []
        : collections.map((c) => c.id).filter((id) => !repeaterData.some((r) => r.id === id));
      return {
        ...[...repeaterDataKeys, ...legacyKeys].reduce((acc, key) => ({ ...acc, [COLLECTION_PREFIX + key]: [] }), {}),
        ...data,
      };
    }
    return data;
  }, [data, collections, repeaterData, dataType, withCollections, requireFetchItem]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9.5 5H9C7.89543 5 7 5.89543 7 7V9C7 10 6.4 12 4 12C5 12 7 12.6 7 15V17.0002C7 18.1048 7.89543 19 9 19H9.5M14.5 5H15C16.1046 5 17 5.89543 17 7V9C17 10 17.6 12 20 12C19 12 17 12.6 17 15V17.0002C17 18.1048 16.1046 19 15 19H14.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("Add field")}</TooltipContent>
      </Tooltip>

      <PopoverContent
        className="z-[9999] max-h-[var(--radix-popover-content-available-height)] w-80 overflow-hidden p-0"
        align="end"
        collisionPadding={8}>
        <PathDropdown
          data={pageData}
          onSelect={(path, type) => {
            onSelect(path, type);
            setOpen(false);
          }}
          dataType={dataType}
          repeaterKey={repeaterKey}
        />
      </PopoverContent>
    </Popover>
  );
}
