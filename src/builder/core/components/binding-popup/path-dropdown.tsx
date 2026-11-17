import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { t } from "i18next";
import { find, startsWith } from "lodash-es";
import React from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { Button } from "~/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";
import type { ChaiCollection } from "~/types/deprecated";
import { BindingOptionRow, type BindingOptionIcon } from "./binding-option-row";
import {
  compareBindingFieldNames,
  getBindingPreview,
  getBindingValueType,
  type BindingOption,
  type BindingValueType,
} from "./binding-options";

export type PathDropdownProps = {
  data: Record<string, any>;
  onSelect: (path: string, type: BindingValueType) => void;
  dataType?: BindingValueType;
  repeaterKey?: string;
};

type DisplayOption = BindingOption & { label: string; icon: BindingOptionIcon };

/**
 * Searchable, drillable key list shared by every binding popup. Objects sort to
 * the top (repeater entry pinned first), everything else alphabetical below.
 */
export const PathDropdown = ({ data, onSelect, dataType, repeaterKey }: PathDropdownProps) => {
  const [currentPath, setCurrentPath] = React.useState<string[]>([]);
  const [currentData, setCurrentData] = React.useState<Record<string, any>>(data);
  const [search, setSearch] = React.useState("");

  // match the exact repeater entry injected at the root, not a prefix: nested keys
  // such as elasticsearch's `@timestamp` share the repeater key's leading `@`
  const isRepeater = (key: string) => currentPath.length === 0 && !!repeaterKey && key === repeaterKey;

  const handleSelect = React.useCallback(
    (option: DisplayOption) => {
      const isValueSelectable = (type: BindingValueType): boolean => {
        if (dataType === "value") return type === "value" || type === "object";
        if (dataType === "array") return type === "array";
        return type === dataType;
      };

      if (option.type === "object") {
        setCurrentPath((prev) => [...prev, option.key]);
        setCurrentData(option.value);
        setSearch("");
      } else if (isValueSelectable(option.type)) {
        onSelect([...currentPath, option.key].join("."), dataType!);
      }
    },
    [currentPath, onSelect, dataType],
  );

  const handleBack = React.useCallback(() => {
    if (currentPath.length > 0) {
      const newPath = currentPath.slice(0, -1);
      setCurrentPath(newPath);
      setCurrentData(newPath.reduce((acc, key) => acc[key], data));
      setSearch("");
    }
  }, [currentPath, data]);

  const collections = useBuilderProp<ChaiCollection[]>("collections", []);

  const options: DisplayOption[] = React.useMemo(() => {
    if (!currentData) return [];
    const rank = (option: DisplayOption) => (option.icon === "repeater" ? 0 : option.type === "object" ? 1 : 2);
    return Object.entries(currentData)
      .map(([key, value]): DisplayOption => {
        const repeater = isRepeater(key);
        const collection = !repeater && startsWith(key, COLLECTION_PREFIX);
        const collectionId = key.replace(COLLECTION_PREFIX, "");
        return {
          key,
          value,
          type: getBindingValueType(value),
          label: repeater
            ? t("Repeater Data")
            : collection
              ? (find(collections, { id: collectionId })?.name ?? collectionId)
              : key,
          icon: repeater ? "repeater" : collection ? "collection" : "field",
        };
      })
      .filter((option) => {
        if (option.icon !== "repeater" && option.key.includes("/")) return false;
        if (dataType === "value") return option.type === "value" || option.type === "object";
        if (dataType === "array") return option.type === "array" || option.type === "object";
        if (dataType === "object") return option.type === "object";
        return true;
      })
      .sort((left, right) => {
        const rankDiff = rank(left) - rank(right);
        if (rankDiff !== 0) return rankDiff;
        return compareBindingFieldNames(left.label, right.label);
      });
  }, [currentData, dataType, repeaterKey, currentPath.length, collections]);

  return (
    <Command className="fields-command">
      <CommandInput className="border-none" placeholder={t("Search...")} value={search} onValueChange={setSearch} />
      <CommandList
        className="max-h-[min(18rem,calc(var(--radix-popover-content-available-height,20rem)-3rem))]"
        onWheel={(e) => {
          // popovers inside modals (RTE dialog, SEO panel) swallow wheel events; scroll manually
          e.preventDefault();
          e.currentTarget.scrollTop += e.deltaY;
        }}>
        <CommandEmpty className="text-muted flex h-24 items-center justify-center text-xs">
          {t("No option found.")}
        </CommandEmpty>
        <CommandGroup>
          {currentPath.length > 0 && (
            <CommandItem onSelect={handleBack} className="text-muted flex items-center gap-2 text-xs">
              <ChevronLeftIcon className="!h-3 !w-3" />
              {t("Back")}
            </CommandItem>
          )}
          {options.map((option) => (
            <CommandItem
              value={option.label === option.key ? option.key : `${option.label} ${option.key}`}
              key={option.key}
              disabled={false}
              onSelect={() => handleSelect(option)}
              className="flex items-center justify-between gap-2 text-xs">
              <BindingOptionRow
                label={option.label}
                icon={option.icon}
                preview={option.type === "value" ? getBindingPreview(option.value) : undefined}
                right={
                  <>
                    {dataType === "object" && option.type === "object" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hover:bg-primary hover:text-primary-foreground h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect([...currentPath, option.key].join("."), dataType);
                        }}>
                        {t("Select")}
                      </Button>
                    )}
                    {option.type === "object" && <ChevronRightIcon className="h-3 w-3 opacity-50" />}
                  </>
                }
              />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
