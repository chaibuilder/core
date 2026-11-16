import { Cross1Icon } from "@radix-ui/react-icons";
import { useDebouncedCallback } from "@react-hookz/web";
import { FieldProps } from "@rjsf/utils";
import { get, isEmpty, map, split, startsWith } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "~/builder/core/utils/cn";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { LANGUAGES } from "~/constants/LANGUAGES";
import { BindingTextField, useBindingInputEnabled } from "./binding-editor/binding-editor-widget";
import { DataBindingSelector } from "./data-binding-selector";
const PageTypeField = ({
  href,
  onChange,
  inputRef,
  resultsClassName,
}: {
  href: string;
  onChange: (href: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Overrides the results list's floating layout, e.g. inside a scrolling popover. */
  resultsClassName?: string;
}) => {
  const { t } = useTranslation();
  const searchPageTypeItems = useBuilderProp("searchPageTypeItems", (_: string, __: any) => []);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageTypeItems, setPageTypeItems] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setSearchQuery("");
    setPageTypeItems([]);
    setSelectedIndex(-1);
    setIsSearching(false);

    if (!href || loading || !startsWith(href, "pageType:")) return;
    const initHref = split(href, ":");

    (async () => {
      const initalValue = await searchPageTypeItems("", [get(initHref, 2, "page")]);
      if (initalValue && Array.isArray(initalValue)) {
        setSearchQuery(get(initalValue, [0, "name"], ""));
      }
    })();
  }, [href]);

  const getPageTypeItems = useDebouncedCallback(
    async (query: string) => {
      if (isEmpty(query)) {
        setPageTypeItems([]);
      } else {
        const pageTypeItemResponse = await searchPageTypeItems("", query);
        setPageTypeItems(pageTypeItemResponse);
      }
      setLoading(false);
      setSelectedIndex(-1);
    },
    [],
    300,
  );

  const handleSelect = (pageTypeItem: any) => {
    const href = ["pageType", pageTypeItem.pageType || "page", pageTypeItem.primaryPage ?? pageTypeItem.id];
    if (!href[1]) return;
    onChange(href.join(":"));
    setSearchQuery(pageTypeItem.name);
    setIsSearching(false);
    setPageTypeItems([]);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < pageTypeItems.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (pageTypeItems.length === 0) return;

        if (selectedIndex >= 0) {
          handleSelect(pageTypeItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        clearSearch();
        break;
    }
  };

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const clearSearch = () => {
    setSearchQuery("");
    setPageTypeItems([]);
    setSelectedIndex(-1);
    setIsSearching(false);
    onChange("");
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearching(!isEmpty(query));
    setLoading(true);
    getPageTypeItems(query);
  };

  return (
    <div>
      <div className="group relative flex items-center">
        <Input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("Search pages")}
          className="pr-8"
        />
        <div className="absolute bottom-2 right-2 top-2 flex items-center gap-1.5">
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="text-muted-foreground hover:text-foreground"
              title={t("Clear search")}>
              <Cross1Icon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {(loading || !isEmpty(pageTypeItems) || (isSearching && isEmpty(pageTypeItems))) && (
        <div
          className={cn(
            "bg-surface absolute z-40 mt-0.5 max-h-40 w-full max-w-[250px] overflow-y-auto rounded-md border border-border shadow-lg",
            resultsClassName,
          )}>
          {loading ? (
            <div className="space-y-1 p-2">
              <div className="h-6 w-full animate-pulse rounded bg-muted/10" />
              <div className="h-6 w-full animate-pulse rounded bg-muted/10" />
            </div>
          ) : isSearching && isEmpty(pageTypeItems) ? (
            <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
              {t("No results found for")} &quot;{searchQuery}&quot;
            </div>
          ) : (
            <ul ref={listRef}>
              {map(pageTypeItems?.slice(0, 20), (item, index) => (
                <li
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`cursor-pointer px-2 py-1 text-xs ${
                    href?.includes(item.id)
                      ? "bg-primary/20"
                      : index === selectedIndex
                        ? "bg-accent"
                        : "hover:bg-accent"
                  }`}>
                  {item.name} {item.slug && <small className="font-light text-muted-foreground">( {item.slug} )</small>}
                  {item.lang && (
                    <small className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {item.lang}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const LinkField = ({ schema, formData, onChange, name, preField = null, showHeader = true }: FieldProps) => {
  const { t } = useTranslation();
  const { type = "pageType", href = "", target = "self" } = formData ?? {};
  const pageTypes = useBuilderProp("pageTypes", []);
  const { selectedLang, fallbackLang, languages } = useLanguages();
  const lang = useMemo(
    () => (isEmpty(languages) ? "" : isEmpty(selectedLang) ? fallbackLang : selectedLang),
    [languages, selectedLang, fallbackLang],
  );
  const currentLanguage = useMemo(() => get(LANGUAGES, lang, lang), [lang]);
  const linkType = type === "pageType" && isEmpty(pageTypes) ? "url" : type;
  const bindingInputEnabled = useBindingInputEnabled();
  const hrefInputRef = useRef<HTMLInputElement>(null);
  const pageTypeInputRef = useRef<HTMLInputElement>(null);
  const prevTypeRef = useRef(type);
  const hrefFieldId = `root.${name}.href`;

  useEffect(() => {
    if (prevTypeRef.current === type) return;
    prevTypeRef.current = type;

    const frame = requestAnimationFrame(() => {
      if (linkType === "pageType" && !isEmpty(pageTypes)) {
        pageTypeInputRef.current?.focus();
        return;
      }
      if (bindingInputEnabled) {
        const bindingEl = document.getElementById(`chai-rte-${hrefFieldId}`) as HTMLDivElement & {
          __chaiRTE?: { commands?: { focus: () => void } };
        };
        bindingEl?.__chaiRTE?.commands?.focus();
        return;
      }
      hrefInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [type, linkType, pageTypes, bindingInputEnabled, hrefFieldId]);

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between gap-x-2">
          <Label>
            {schema?.title ?? "Link"}
            <span className="pl-1 text-[9px] text-muted-foreground">{currentLanguage}</span>
          </Label>
          <DataBindingSelector
            schema={schema}
            spacing="none"
            onChange={(value) => {
              onChange({
                ...formData,
                href: value,
                ...(linkType === "pageType" ? { type: "url" } : {}),
              });
            }}
            id={hrefFieldId}
            formData={formData}
          />
        </div>
      )}
      {preField}
      <div className="flex flex-col gap-y-1.5">
        <div className="flex items-center gap-x-2">
          <select
            className="flex h-8 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            name="type"
            value={type}
            onChange={(e) => onChange({ ...formData, type: e.target.value })}>
            {map(
              [
                ...(!isEmpty(pageTypes) ? [{ const: "pageType", title: t("Goto Page") }] : []),
                { const: "url", title: t("Open URL") },
                { const: "email", title: t("Compose Email") },
                { const: "telephone", title: t("Call Phone") },
                { const: "scroll", title: t("Scroll to element") },
              ],
              (opt) => (
                <option key={opt.const} value={opt.const}>
                  {opt.title}
                </option>
              ),
            )}
          </select>
          {linkType === "url" && (
            <div className="flex shrink-0 items-center gap-x-1.5 text-muted-foreground" title={t("Open in new tab")}>
              <Checkbox
                id={`root.${name}.target`}
                checked={target === "_blank"}
                onCheckedChange={(checked) => onChange({ ...formData, target: checked ? "_blank" : "_self" })}
              />
              <Label htmlFor={`root.${name}.target`} className="!mb-0 whitespace-nowrap pb-0 text-xs">
                {t("New tab")}
              </Label>
            </div>
          )}
        </div>
        {linkType === "pageType" && !isEmpty(pageTypes) ? (
          <PageTypeField
            href={href}
            inputRef={pageTypeInputRef}
            onChange={(href: string) => onChange({ ...formData, href })}
          />
        ) : null}
        {bindingInputEnabled ? (
          <BindingTextField
            id={hrefFieldId}
            className={linkType === "pageType" ? "!hidden" : ""}
            value={href}
            placeholder={t(type === "url" ? "Enter URL" : type === "scroll" ? "#ElementID" : "Enter details")}
            onChange={(hrefValue) => onChange({ ...formData, href: hrefValue })}
          />
        ) : (
          <Input
            ref={hrefInputRef}
            id={hrefFieldId}
            autoCapitalize={"off"}
            autoCorrect={"off"}
            spellCheck={"false"}
            name="href"
            type="text"
            className={linkType === "pageType" ? "!hidden" : ""}
            value={href}
            onChange={(e) => onChange({ ...formData, href: e.target.value })}
            placeholder={t(type === "url" ? "Enter URL" : type === "scroll" ? "#ElementID" : "Enter details")}
          />
        )}
      </div>
    </div>
  );
};

export { LinkField, PageTypeField };
