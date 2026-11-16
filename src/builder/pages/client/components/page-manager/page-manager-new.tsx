import { useSetAtom } from "jotai";
import { filter, find, isEmpty, map } from "lodash-es";
import { File } from "lucide-react";
import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTabLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { addNewLangAtom } from "~/builder/pages/atom/add-new-lang";
import { PAGE_CATEGORY_FILTER_KEY } from "~/builder/pages/atom/page-manager";
import { useWebsiteLanguagePages, useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { usePageExpandManager } from "~/builder/pages/hooks/utils/use-page-expand-manager";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { navigateToPage } from "~/builder/pages/utils/navigation";
import { organizePages } from "~/builder/pages/utils/page-organization";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";
import RenderPageItems from "./render-page-items";
const PageManagerSearchAndFilter = lazy(() => import("./page-manager-search-and-filter"));

// * Action Modals
const AddNewPage = lazy(() => import("../add-new-page"));
const DeletePage = lazy(() => import("../delete-page"));
const DuplicatePage = lazy(() => import("../duplicate-page"));
const MarkAsTemplate = lazy(() => import("../mark-as-template"));
const UnmarkAsTemplate = lazy(() => import("../unmark-as-template"));
const UnpublishPage = lazy(() => import("../unpublish-page"));

interface PageManagerNewProps {
  close: () => void;
}

const PagesManagerNew = ({ close }: PageManagerNewProps) => {
  const { t } = useTranslation();
  const { languages, setSelectedLang } = useLanguages();
  const { data: pageTypes } = usePageTypes();
  const layoutPagesEnabled = useBuilderProp("flags.layoutPages", false);
  const partialsLabel = usePartialTabLabel();
  const { data, isFetching } = useWebsitePrimaryPages();
  const [queryParams, setQueryParams] = useSearchParams();
  const { updateForSelectedPage, expandPagesOnSearch } = usePageExpandManager(null);
  const fallbackLang = useFallbackLang();
  const currentPage = queryParams.get("page");

  // * Page manager
  const [search, setSearch] = useState("");
  const [deletePage, setDeletePage] = useState(null);
  const [addEditPage, setAddEditPage] = useState(null);
  const [unpublishPage, setUnpublishPage] = useState(null);
  const [markAsTemplate, setMarkAsTemplate] = useState(null);
  const [_selectedPageType, _setSelectedPageType] = useState(() => {
    const pageType = sessionStorage.getItem("pageTypeFilter") || "all";
    return pageType;
  });
  const [category, _setCategory] = useState(() => {
    return sessionStorage.getItem(PAGE_CATEGORY_FILTER_KEY) || "pages";
  });
  const [selectedTags, _setSelectedTags] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem("pageTagsFilter");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  });
  const setSelectedTags = useCallback((tags: string[]) => {
    _setSelectedTags(tags);
    sessionStorage.setItem("pageTagsFilter", JSON.stringify(tags));
  }, []);

  // Tags actually present across the site (union of metadata.__tags), for the filter control.
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const page of (data as any[]) ?? []) {
      const tags = page?.metadata?.[PARTIAL_TAGS_METADATA_KEY];
      if (!Array.isArray(tags)) continue;
      for (const tag of tags) {
        if (typeof tag !== "string") continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [data]);
  const [duplicatePage, setDuplicatePage] = useState<any>(null);
  const [unmarkAsTemplate, setUnmarkAsTemplate] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(fallbackLang);
  const [_showUntranslatedPages, setShowUntranslatedPages] = useState(false);
  const setAddNewLang = useSetAtom(addNewLangAtom);
  const showUntranslatedPages = _showUntranslatedPages && selectedLanguage !== fallbackLang;
  const { data: languagePages, isFetching: isFetchingLangPages } = useWebsiteLanguagePages(selectedLanguage);

  const setCategory = useCallback(
    (value: string) => {
      _setCategory(value);
      sessionStorage.setItem(PAGE_CATEGORY_FILTER_KEY, value);
      _setSelectedPageType("all");
      if (value === "partials") {
        setSelectedLanguage(fallbackLang);
      }
    },
    [fallbackLang],
  );

  const selectedPageType = useMemo(() => {
    if (!isEmpty(pageTypes) && _selectedPageType && _selectedPageType !== "all") {
      if (!find(pageTypes, { key: _selectedPageType })) {
        return "all";
      }
    }
    return _selectedPageType;
  }, [pageTypes, _selectedPageType]);

  const setSelectedPageType = useCallback((value: string) => {
    _setSelectedPageType(value);
  }, []);

  const hasSlug = useCallback(
    (pageType: string) => {
      return find(pageTypes, { key: pageType })?.hasSlug !== false;
    },
    [pageTypes],
  );

  const pages: any[] = useMemo(() => {
    if (!data) return [];
    let filteredData = data;
    // Filter out blocks (no slug) if the selected language is not the fallback language
    if (selectedLanguage !== fallbackLang) {
      filteredData = filter(data, (page) => hasSlug(page.pageType) !== false);
    }
    if (showUntranslatedPages) return filter(filteredData, (page) => !languagePages?.[page.id]);
    // The tag filter is only shown on the partials tab, so it only applies there.
    const activeTags = !search && category === "partials" ? selectedTags : [];
    const organized = organizePages(filteredData, search, selectedPageType, hasSlug, activeTags);
    return filter(organized, (page) => {
      if (search) return true;
      if (category === "pages") return hasSlug(page.pageType);
      if (category === "layouts") return page.pageType === "_layout";
      // partials: slugless types other than layouts (layouts have their own tab when enabled)
      return !hasSlug(page.pageType) && (!layoutPagesEnabled || page.pageType !== "_layout");
    });
  }, [
    data,
    hasSlug,
    search,
    selectedPageType,
    selectedTags,
    languagePages,
    showUntranslatedPages,
    selectedLanguage,
    fallbackLang,
    category,
    layoutPagesEnabled,
  ]);

  useEffect(() => {
    setSelectedLang(fallbackLang);
  }, [fallbackLang, setSelectedLang]);

  /**
   * Validate selectedLanguage against available languages
   */
  useEffect(() => {
    const langParam = queryParams.get("lang");
    if (langParam) {
      const validLanguages = languages;
      const fallbackLanguageForUrl = languages[0] ?? fallbackLang;
      const isValidLang = validLanguages.includes(langParam);
      startTransition(() => {
        if (isValidLang && selectedLanguage !== langParam) {
          setSelectedLanguage(langParam);
        } else if (!isValidLang && selectedLanguage !== fallbackLanguageForUrl) {
          setSelectedLanguage(fallbackLanguageForUrl);
        }
      });
    }
  }, []);

  /**
   * Handles validation of current page
   * If page doesn't exist, clear the page query parameter to show the Pages Manager
   */
  useEffect(() => {
    if (currentPage && !isFetching) {
      const page = find(data, { id: currentPage });
      if (!page) {
        // Clear the page query parameter to show the Pages Manager while preserving the current pathname
        const newParams = new URLSearchParams(queryParams.toString());
        newParams.delete("page");

        // If there are remaining query parameters, update the URL while preserving the hash;
        // otherwise, preserve the current pathname and hash and clear the search string.
        if ([...newParams.keys()].length > 0) {
          if (typeof window !== "undefined" && window.history && window.location) {
            const search = newParams.toString();
            const hash = window.location.hash || "";
            const pathname = window.location.pathname;
            const newUrl = search ? `${pathname}?${search}${hash}` : `${pathname}${hash}`;

            window.history.replaceState(window.history.state, "", newUrl);
          }
          setQueryParams(newParams);
        } else {
          if (typeof window !== "undefined" && window.history && window.location) {
            window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
            // Manually dispatch a popstate event to keep behavior consistent
            // with navigateToPage, which also triggers a popstate.
            window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
          }
          setQueryParams(newParams);
        }
      }
    }
  }, [data, currentPage, isFetching, setQueryParams, queryParams]);

  /**
   * Separate useEffect to expand parent pages after pages are computed
   */
  useEffect(() => {
    if (currentPage && !isFetching && !isEmpty(pages)) {
      updateForSelectedPage(pages, currentPage);
    }
  }, [currentPage, isFetching, pages, updateForSelectedPage]);

  useEffect(() => {
    if (!isEmpty(search) && !isEmpty(pages)) {
      expandPagesOnSearch(pages);
    }
  }, [search, pages, expandPagesOnSearch]);

  /**
   * Handles change page action
   * @param page page to change
   */
  const { setSelectedLang: setActiveLanguage } = useLanguages();
  const changePage = useCallback(
    (page: string) => {
      const newParams = new URLSearchParams({ page });
      if (selectedLanguage !== fallbackLang) {
        newParams.set("lang", selectedLanguage);
        setActiveLanguage(selectedLanguage);
      } else {
        setActiveLanguage("");
      }
      navigateToPage(newParams, setQueryParams);
      close();
    },
    [close, setQueryParams, setActiveLanguage, selectedLanguage, fallbackLang],
  );

  /**
   * Handles click action for page manager
   * @param action action to perform
   * @param arg argument for action
   */
  const handleClickAction = (action: string, arg: any) => {
    if (!arg) return;
    switch (action) {
      case "add":
        setAddEditPage(arg);
        break;
      case "select":
        changePage(arg);
        break;
      case "edit":
        if (selectedLanguage !== fallbackLang) {
          setAddNewLang({
            edit: true,
            id: arg?.id,
            primaryPage: arg?.primaryPage,
          });
        } else {
          setAddEditPage(arg);
        }
        break;
      case "delete":
        setDeletePage(arg);
        break;
      case "unpublish":
        setUnpublishPage(arg);
        break;
      case "markAsTemplate":
        setMarkAsTemplate(arg);
        break;
      case "unmarkAsTemplate":
        setUnmarkAsTemplate(arg);
        break;
      case "duplicate":
        setDuplicatePage(arg);
        break;
      case "addLanguagePage":
        setAddNewLang({
          edit: false,
          primaryPage: arg?.page?.id || "",
          preselectedLang: arg?.language || selectedLanguage,
        });
        break;
    }
  };

  return (
    <>
      <div className="flex h-full flex-col justify-between">
        <Suspense>
          <PageManagerSearchAndFilter
            pages={pages}
            search={search}
            setSearch={setSearch}
            languages={[fallbackLang, ...languages]}
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
            selectedPageType={selectedPageType}
            setSelectedPageType={setSelectedPageType}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            availableTags={availableTags}
            onAddPage={(arg) => handleClickAction("add", arg)}
            showUntranslatedPages={showUntranslatedPages}
            setShowUntranslatedPages={setShowUntranslatedPages}
            category={category}
            setCategory={setCategory}
          />
        </Suspense>
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {isFetching || isFetchingLangPages ? (
            <div className="space-y-2">
              {map([...Array(15).keys()], (key) => (
                <div key={key} className="h-7 w-full animate-pulse rounded border border-border bg-accent" />
              ))}
            </div>
          ) : isEmpty(pages) ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-y-1 text-center text-sm font-medium text-muted-foreground">
              <File className="h-6 w-6 stroke-[1]" />
              {search ? (
                <>
                  {t("No results found")}
                  <span className="font-light">{t("Try adjusting your search to find what you're looking for.")}</span>
                </>
              ) : category === "partials" ? (
                <>
                  <span className="max-w-[300px] font-light">
                    {t("Create reusable blocks to maintain consistency and design faster.")}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-light">{t("Add new page to start")}</span>
                </>
              )}
            </div>
          ) : search ? (
            <div className="space-y-2">
              {filter(pages, (p) => hasSlug(p.pageType)).length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t("Pages")}</div>
                  <RenderPageItems
                    tier={0}
                    pages={filter(pages, (p) => hasSlug(p.pageType))}
                    pageTypes={pageTypes}
                    currentPage={currentPage || ""}
                    onClickAction={handleClickAction}
                    languagePages={languagePages as any}
                    selectedLanguage={selectedLanguage}
                    showUntranslatedPages={showUntranslatedPages}
                  />
                </div>
              )}
              {filter(pages, (p) => !hasSlug(p.pageType)).length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{partialsLabel}</div>
                  <RenderPageItems
                    tier={0}
                    pages={filter(pages, (p) => !hasSlug(p.pageType))}
                    pageTypes={pageTypes}
                    currentPage={currentPage || ""}
                    onClickAction={handleClickAction}
                    languagePages={languagePages as any}
                    selectedLanguage={selectedLanguage}
                    showUntranslatedPages={showUntranslatedPages}
                  />
                </div>
              )}
            </div>
          ) : (
            <RenderPageItems
              tier={0}
              pages={pages}
              pageTypes={pageTypes}
              currentPage={currentPage || ""}
              onClickAction={handleClickAction}
              languagePages={languagePages as any}
              selectedLanguage={selectedLanguage}
              showUntranslatedPages={showUntranslatedPages}
            />
          )}
        </div>
      </div>

      {addEditPage && (
        <Suspense>
          <AddNewPage
            closePanel={close}
            editPage={changePage}
            addEditPage={addEditPage}
            setAddEditPage={setAddEditPage}
          />
        </Suspense>
      )}

      {deletePage && (
        <Suspense>
          <DeletePage page={deletePage} onClose={() => setDeletePage(null)} />
        </Suspense>
      )}

      {unpublishPage && (
        <Suspense>
          <UnpublishPage page={unpublishPage} onClose={() => setUnpublishPage(null)} />
        </Suspense>
      )}

      {markAsTemplate && (
        <Suspense>
          <MarkAsTemplate page={markAsTemplate} onClose={() => setMarkAsTemplate(null)} />
        </Suspense>
      )}

      {unmarkAsTemplate && (
        <Suspense>
          <UnmarkAsTemplate page={unmarkAsTemplate} onClose={() => setUnmarkAsTemplate(null)} />
        </Suspense>
      )}

      {duplicatePage && (
        <Suspense>
          <DuplicatePage page={duplicatePage} onClose={() => setDuplicatePage(null)} closePanel={close} />
        </Suspense>
      )}
    </>
  );
};

export default PagesManagerNew;
