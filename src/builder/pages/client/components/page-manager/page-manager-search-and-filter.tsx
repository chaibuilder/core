import { useQueryClient } from "@tanstack/react-query";
import { filter, find, get } from "lodash-es";
import { ChevronsDownUp, ChevronsUpDown, Filter, FilterXIcon, Plus, RefreshCw, Star } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import SearchInput from "~/builder/core/components/sidepanels/panels/add-blocks/search-input";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTabLabel } from "~/builder/hooks/use-create-partial-label";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { usePageExpandManager } from "~/builder/pages/hooks/utils/use-page-expand-manager";
import { ChaiPage } from "~/builder/pages/utils/page-organization";
import { TagFilterSelector } from "./tag-filter-selector";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { ChaiPageType } from "~/types/actions";

/**
 * ExpandCollapse
 * Props for ExpandCollapse component
 * @param pages - Array of pages to be displayed
 * @returns Expand/Collapse buttons
 */
const ExpandCollapse = ({ pages }: { pages: ChaiPage[] }) => {
  const { t } = useTranslation();
  const { expandAll, collapseAll, expandedPages } = usePageExpandManager(null);
  const isAnyExpanded = expandedPages.length > 0;
  return (
    <div className="flex gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-sm" onClick={() => (isAnyExpanded ? collapseAll() : expandAll(pages))}>
            {isAnyExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isAnyExpanded ? t("Collapse All") : t("Expand All")}</TooltipContent>
      </Tooltip>
    </div>
  );
};

/**
 * Props for LanguageSelector component
 */
interface LanguageSelectorProps {
  languages: string[];
  selectedLanguage: string;
  setSelectedLanguage: (selectedLanguage: string) => void;
}

/**
 * LanguageSelector
 * Renders a row of language selection buttons.
 * @param languages - Array of available languages
 * @param selectedLanguage - Currently selected language
 * @param setSelectedLanguage - Setter for selected language
 */
export const ChaiLanguageFilterSelect = ({
  languages,
  selectedLanguage,
  setSelectedLanguage,
}: LanguageSelectorProps) => {
  const fallbackLang = useChaiFallbackLang();
  return (
    <Tabs
      onValueChange={(_tab) => setSelectedLanguage(_tab.toLowerCase())}
      value={selectedLanguage}
      className={"flex h-7 max-h-full flex-col overflow-x-auto overflow-y-hidden"}>
      <TabsList className={`flex w-full items-center`}>
        {languages.map((lang) => (
          <TabsTrigger key={lang} value={lang} className={"h-5 px-3 text-xs"}>
            {lang === fallbackLang && (
              <span>
                <Star className="h-2.5 w-2.5" />
              </span>
            )}
            {LANGUAGES[lang] || ""}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

const RefreshPagesList = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: [ACTIONS.GET_WEBSITE_PAGES],
            })
          }>
          <RefreshCw />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{t("Refresh pages list")}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Props for PageManagerSearchAndFilter component
 */
export interface PageManagerSearchAndFilterProps {
  pages: ChaiPage[];
  search: string;
  setSearch: (search: string) => void;
  languages: string[];
  selectedLanguage: string;
  setSelectedLanguage: (selectedLanguage: string) => void;
  selectedPageType: string;
  setSelectedPageType: (selectedPageType: string) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  availableTags: string[];
  onAddPage: (arg: any) => void;
  showUntranslatedPages: boolean;
  setShowUntranslatedPages: (showUntranslatedPages: boolean) => void;
  category: string;
  setCategory: (category: string) => void;
}

/**
 * PageManagerSearchAndFilter
 * Main filter/search component for the Page Manager, providing search, language, and page type controls.
 * @param pages - Array of pages to be displayed
 * @param search - Current search query
 * @param setSearch - Setter for search query
 * @param languages - Array of available languages
 * @param onAddPage - Callback function to handle add page action
 * @param selectedLanguage - Currently selected language
 * @param setSelectedLanguage - Setter for selected language
 * @param selectedPageType - Currently selected page type
 * @param setSelectedPageType - Setter for selected page type
 */
const PageManagerSearchAndFilter = ({
  pages,
  search,
  setSearch,
  languages,
  onAddPage,
  selectedLanguage,
  setSelectedLanguage,
  selectedTags,
  setSelectedTags,
  availableTags,
  showUntranslatedPages,
  setShowUntranslatedPages,
  category,
  setCategory,
}: PageManagerSearchAndFilterProps) => {
  const { t } = useTranslation();
  const tabLabel = usePartialTabLabel();
  const { data: pageTypes } = useChaiPageTypes();
  const layoutPagesEnabled = useBuilderProp("flags.layoutPages", false);
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);
  const isMultiLingual = languages.length > 1;

  // Partial page types (no slug) usable as global blocks. Layouts are always
  // excluded here — when enabled they live in their own tab, when disabled they
  // are not a partial-create option.
  const partialTypes = useMemo(
    () =>
      filter(pageTypes, (pageType: ChaiPageType) => pageType.hasSlug === false && get(pageType, "key") !== "_layout"),
    [pageTypes],
  );
  // Prefer the built-in "global" block type, else fall back to the first available partial
  const defaultPartialType = (find(partialTypes, { key: "global" }) ?? partialTypes[0]) as ChaiPageType | undefined;
  const layoutType = find(pageTypes, { key: "_layout" }) as ChaiPageType | undefined;

  return (
    <TooltipProvider>
      <div className="border-b-border space-y-3 border-b px-4 pt-2 pb-2">
        {/* Top Row: Search and Actions */}
        <div className="flex w-full items-center gap-2">
          <div className="flex-1">
            <SearchInput value={search} setValue={setSearch} placeholder={t("Search pages and blocks...")} autoFocus />
          </div>
          {!search && (
            <div className="flex shrink-0 items-center justify-end gap-1">
              <RefreshPagesList />
              <ExpandCollapse pages={pages} />
              {category === "pages" && (
                <Button
                  id="add-page-button"
                  variant="default"
                  onClick={() => onAddPage({ pageType: "page" })}
                  size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  <span>{t("Add Page")}</span>
                </Button>
              )}
              {category === "partials" && partialBlocksEnabled && defaultPartialType && (
                <Button
                  id="create-partial-button"
                  variant="default"
                  onClick={() => onAddPage({ pageType: defaultPartialType.key })}
                  size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  <span>{t("Create {{name}}", { name: defaultPartialType.name })}</span>
                </Button>
              )}
              {category === "layouts" && layoutPagesEnabled && layoutType && (
                <Button variant="default" onClick={() => onAddPage({ pageType: "_layout" })} size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  <span>{t("Create {{name}}", { name: layoutType.name })}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Second Row: Context & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left Side: Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {!search && (
              <Tabs onValueChange={setCategory} value={category} className="flex h-8 items-center p-0">
                <TabsList
                  className={`bg-muted/50 grid h-8 items-center rounded p-0 px-0.5 ${layoutPagesEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
                  <TabsTrigger value="pages" className="h-7 rounded-sm px-2 py-0.5 text-xs">
                    {t("Pages")}
                  </TabsTrigger>
                  <TabsTrigger value="partials" className="h-7 rounded-sm px-2 py-0.5 text-xs">
                    {tabLabel}
                  </TabsTrigger>
                  {layoutPagesEnabled && (
                    <TabsTrigger value="layouts" className="h-7 rounded-sm px-2 py-0.5 text-xs">
                      {t("Layouts")}
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            )}
          </div>

          {/* Right Side: Filters */}
          <div className="flex shrink-0 items-center justify-end gap-2 overflow-x-auto">
            {(category === "pages" || search) && isMultiLingual && (
              <div className="flex items-center gap-1">
                <ChaiLanguageFilterSelect
                  languages={languages}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={(_selection) => {
                    setSelectedLanguage(_selection);
                    setShowUntranslatedPages(showUntranslatedPages && languages?.[0] !== selectedLanguage);
                  }}
                />
                {!search && languages?.[0] !== selectedLanguage && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setShowUntranslatedPages(!showUntranslatedPages)}>
                        {showUntranslatedPages ? <FilterXIcon className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("Toggle Untranslated Pages")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Third Row: Tag filter (partials only) — its own full-width row so the chips wrap instead of overflowing */}
        {!search && category === "partials" && (
          <TagFilterSelector
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            availableTags={availableTags}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default PageManagerSearchAndFilter;
