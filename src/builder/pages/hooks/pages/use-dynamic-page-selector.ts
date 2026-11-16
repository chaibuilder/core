import { useQuery } from "@tanstack/react-query";
import { atom, PrimitiveAtom, useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguages } from "~/builder/hooks/use-languages";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { usePageType } from "~/builder/pages/hooks/project/use-page-types";
import { usePrimaryPage } from "./use-current-page";
import {
  createManualDynamicPage,
  createPlaceholderDynamicPage,
  readUrlSlug,
  resolveEffectiveLang,
  updateUrlSlug,
} from "./use-dynamic-page-selector.utils";

type DynamicPage = {
  id: string;
  name: string;
  slug: string;
  /** What the page type looks this item up by. Falls back to `slug` for page types that predate it. */
  identifier?: string;
  lang: string;
  primaryPage?: string;
  /** Builder page this item was selected for. Selections don't carry across pages. */
  pageId?: string;
  /** Typed in by the user instead of picked from the list, so it was never verified server-side. */
  manual?: boolean;
  /** Synthetic fallback for an empty collection; the "no content found" gate ignores it. */
  placeholder?: boolean;
};

export const selectedDynamicPage = atom<null | DynamicPage>(null) as PrimitiveAtom<null | DynamicPage>;

export const useSelectedDynamicPage = () => useAtom(selectedDynamicPage);

/**
 * Selection for the page currently open, or null when the atom still holds an
 * item picked on a different page (the atom outlives navigation).
 */
const useDynamicPageForCurrentPage = (): DynamicPage | null => {
  const [dynamicPage] = useSelectedDynamicPage();
  const { data: currentPage } = usePrimaryPage();
  if (!dynamicPage) return null;
  if (dynamicPage.pageId && currentPage?.id && dynamicPage.pageId !== currentPage.id) return null;
  return dynamicPage;
};

export const useDynamicPageSlug = () => {
  const dynamicPage = useDynamicPageForCurrentPage();
  return dynamicPage?.slug || "";
};

export const useDynamicPageIdentifier = () => {
  const dynamicPage = useDynamicPageForCurrentPage();
  return dynamicPage?.identifier || dynamicPage?.slug || "";
};

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

const useGetDynamicPages = ({
  query,
  identifier,
  enabled = true,
}: {
  query: string;
  identifier?: string;
  enabled?: boolean;
}) => {
  const { selectedLang, fallbackLang } = useLanguages();
  const { data: currentPage } = usePrimaryPage();
  const pageType = currentPage?.pageType;
  const pageSlug = currentPage?.slug;
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();

  const lang = resolveEffectiveLang(selectedLang, fallbackLang);

  const { data, isFetching, isSuccess } = useQuery<DynamicPage[]>({
    queryKey: [ACTIONS.GET_DYNAMIC_PAGES, query, identifier, pageType, pageSlug, lang],
    staleTime: 60 * 60 * 1000,
    placeholderData: [],
    queryFn: async () => {
      const resData = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_DYNAMIC_PAGES,
        data: { query, identifier, pageType, pageSlug, lang },
      });
      return (resData || []) as DynamicPage[];
    },
    enabled: !!pageType && enabled,
  });

  return { allLangPages: data, data, isFetching, isSuccess };
};

export const useDynamicPageSelector = () => {
  const { selectedLang, fallbackLang } = useLanguages();
  const [storedDynamicPage, setDynamicPage] = useSelectedDynamicPage();
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const { data: currentPage } = usePrimaryPage();
  const pageType = currentPage?.pageType;
  const pageSlug = currentPage?.slug;
  const isDynamic = currentPage?.dynamic;
  const pageTypeRecord = usePageType(pageType ?? "");

  // Tri-state. `undefined` while the page types are still loading — the lookup in
  // [3] must not run before this resolves, or a manual identifier would briefly
  // look like a missing translation. Page types serialized without the flag are
  // treated as having the function, which keeps older hosts on today's behaviour.
  const hasGetDynamicPages: boolean | undefined = pageTypeRecord
    ? pageTypeRecord.hasGetDynamicPages !== false
    : undefined;

  // Ignore a selection made on another page until [1.5] clears it, so the
  // header never renders the previous page's item.
  const dynamicPage =
    storedDynamicPage?.pageId && currentPage?.id && storedDynamicPage.pageId !== currentPage.id
      ? null
      : storedDynamicPage;

  // [1] State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 500);
  const [lookupIdentifier, setLookupIdentifier] = useState<string | null>(() => readUrlSlug());
  const [isLangMissing, setIsLangMissing] = useState(false);
  // Identifier whose lookup came back empty. Kept so the overlay can offer to open
  // it anyway instead of leaving the user stuck.
  const [failedLookupIdentifier, setFailedLookupIdentifier] = useState<string | null>(null);

  const dynamicPageIdentifier = dynamicPage?.identifier ?? dynamicPage?.slug ?? null;
  const effectiveLang = resolveEffectiveLang(selectedLang, fallbackLang);

  const {
    allLangPages,
    data: dynamicPages,
    isFetching,
    isSuccess: isListSettled,
  } = useGetDynamicPages({
    query: debouncedSearchQuery,
    // A page type without the function always answers `[]`, so skip the request.
    enabled: hasGetDynamicPages !== false,
  });

  // [1.5] Page-change effect: the selection atom outlives navigation, so a
  // stale item from the previous page type would otherwise stay selected.
  const prevPageIdRef = useRef(currentPage?.id);
  useEffect(() => {
    const pageId = currentPage?.id;
    if (!pageId || prevPageIdRef.current === pageId) return;
    const hadPreviousPage = !!prevPageIdRef.current;
    prevPageIdRef.current = pageId;
    if (!hadPreviousPage) return; // first resolve of the page, keep any deep-linked selection

    setDynamicPage(null);
    setLookupIdentifier(null);
    setIsLangMissing(false);
    setFailedLookupIdentifier(null);
    updateUrlSlug(null);
  }, [currentPage?.id, setDynamicPage]);

  // [2] Lang-change effect (primitive deps)
  const isManualSelection = !!dynamicPage?.manual;
  const prevLangRef = useRef(selectedLang);
  useEffect(() => {
    if (prevLangRef.current !== selectedLang) {
      prevLangRef.current = selectedLang;
      if (dynamicPageIdentifier) {
        if (isManualSelection) {
          // A typed identifier has no listing to look up, so carry it into the new
          // language as-is. Whether content exists there is answered downstream by
          // the page data load, not here.
          setDynamicPage((current) => (current ? { ...current, lang: effectiveLang } : current));
          setIsLangMissing(false);
          return;
        }
        // Lang changed while a page is selected -> trigger a lookup for the translation
        setLookupIdentifier(dynamicPageIdentifier);
        setDynamicPage(null);
        setIsLangMissing(false);
      }
    }
  }, [selectedLang, dynamicPageIdentifier, isManualSelection, effectiveLang, setDynamicPage]);

  // [2.7] Page types that cannot list their items resolve a requested identifier
  // directly, since [3] would query an endpoint that always answers `[]`.
  useEffect(() => {
    if (!isDynamic || !lookupIdentifier || hasGetDynamicPages !== false) return;
    const manualPage = createManualDynamicPage(lookupIdentifier, effectiveLang);
    setLookupIdentifier(null);
    if (!manualPage) return;
    setDynamicPage({ ...manualPage, pageId: currentPage?.id });
    setIsLangMissing(false);
    setFailedLookupIdentifier(null);
    updateUrlSlug(manualPage.identifier);
  }, [isDynamic, lookupIdentifier, hasGetDynamicPages, effectiveLang, currentPage?.id, setDynamicPage]);

  // [2.8] No-selection fallback. A dynamic page opened from the Pages list has no
  // slug in the URL, so without a selection the builder is stuck on the "No pages
  // found" overlay and the template's visual layout can't be edited. Auto-select a
  // synthetic "placeholder-slug" page so the template renders and stays editable.
  // The placeholder is flagged so the downstream "no content found" gate ignores
  // it, and it is deliberately NOT written to the URL (a reload would otherwise
  // look it up, fail, and fall into the "open it anyway" flow).
  //
  // - Listing page types (getDynamicPages): only fall back once the list has
  //   settled empty — a non-empty list is handled by the first-item path in [3].
  // - Non-listing page types: there is no list to consult (the query is disabled),
  //   so fall back immediately. Their builder dataProvider still resolves preview
  //   data on its own (e.g. `{ type: 'first' }`), or renders with empty bindings.
  useEffect(() => {
    // Wait until the page type resolves — see [2.7] for the tri-state rationale.
    if (!isDynamic || hasGetDynamicPages === undefined) return;
    // A specific item is being resolved or was already picked — leave it be.
    if (lookupIdentifier || failedLookupIdentifier || dynamicPageIdentifier) return;
    if (hasGetDynamicPages === true) {
      // Wait for the real list result; ignore the initial `[]` placeholder data.
      if (isFetching || !isListSettled) return;
      if ((allLangPages ?? []).length > 0) return;
    }
    setDynamicPage({ ...createPlaceholderDynamicPage(effectiveLang), pageId: currentPage?.id });
    setIsLangMissing(false);
  }, [
    isDynamic,
    hasGetDynamicPages,
    isFetching,
    isListSettled,
    allLangPages,
    lookupIdentifier,
    failedLookupIdentifier,
    dynamicPageIdentifier,
    effectiveLang,
    currentPage?.id,
    setDynamicPage,
  ]);

  // [2.9] Placeholder handover. The placeholder is a stand-in for an empty
  // collection, so once real items exist (e.g. the user just created the first
  // one via the Add panel, which refetches the list) drop it and let [3] pick the
  // first real item. Runs only in the non-empty direction, so it never fights
  // [2.8], which only fires while the list is empty.
  useEffect(() => {
    if (!dynamicPage?.placeholder) return;
    if ((allLangPages ?? []).length === 0) return;
    setDynamicPage(null);
  }, [dynamicPage?.placeholder, allLangPages, setDynamicPage]);

  // [3] Active page query
  const { data: activePageData, isSuccess: isActiveQuerySuccess } = useQuery({
    queryKey: [ACTIONS.GET_DYNAMIC_PAGES, "active", lookupIdentifier, effectiveLang, pageType, pageSlug],
    enabled:
      !!pageType &&
      !!isDynamic &&
      // Only meaningful once we know the page type can list its items — see [2.7].
      hasGetDynamicPages === true &&
      (!!lookupIdentifier || (!!allLangPages && (allLangPages as any).length > 0 && !dynamicPageIdentifier)),
    queryFn: async () => {
      if (lookupIdentifier) {
        // Specific page requested via URL or lang switch
        const resData = await fetchAPI(apiUrl, {
          action: ACTIONS.GET_DYNAMIC_PAGES,
          data: { query: "", identifier: lookupIdentifier, lang: effectiveLang, pageType, pageSlug },
        });
        return (resData as any)?.[0] || null;
      }
      // No specific item requested, fallback to first available
      return (allLangPages as any)?.[0] || null;
    },
  });

  // [4] Post-query effect (resolve lookup result)
  useEffect(() => {
    if (!isActiveQuerySuccess) return;
    // With an item selected and no lookup pending, [3] is disabled and its data is
    // a cached first-item fallback from earlier. Applying it would undo the
    // lookup [2] just queued on a language switch and reset the selection.
    if (!lookupIdentifier && dynamicPageIdentifier) return;

    if (activePageData) {
      // Translation or specific page found
      setDynamicPage({ ...activePageData, pageId: currentPage?.id });
      setLookupIdentifier(null);
      // The URL param round-trips into the next lookup, so it carries the
      // identifier even though the param is named `slug`.
      updateUrlSlug(activePageData.identifier ?? activePageData.slug);
      setIsLangMissing(false);
      setFailedLookupIdentifier(null);
    } else if (lookupIdentifier) {
      // Looked for a specific page, but it wasn't found (likely missing translation,
      // or an identifier the user typed that this page type doesn't list).
      setIsLangMissing(true);
      setFailedLookupIdentifier(lookupIdentifier);
      setLookupIdentifier(null);
    }
  }, [isActiveQuerySuccess, activePageData, lookupIdentifier, dynamicPageIdentifier, currentPage?.id, setDynamicPage]);

  // [4.1] Sync selected page name from updated list. A manual selection keys off the
  // typed identifier, so it only matches here when that identifier is a real item's
  // id — in which case replacing it with the real record is the right move.
  useEffect(() => {
    if (!dynamicPage || !allLangPages) return;
    const updated = (allLangPages as any[]).find((p) => p.id === dynamicPage.id);
    if (updated && updated.name !== dynamicPage.name) {
      setDynamicPage({ ...updated, pageId: dynamicPage.pageId });
    }
  }, [allLangPages, dynamicPage, setDynamicPage]);

  // [5] Stable callbacks
  const updateDynamicPage = useCallback(
    (page: any) => {
      setDynamicPage(page ? { ...page, pageId: currentPage?.id } : null);
      setIsLangMissing(false);
      setFailedLookupIdentifier(null);
      updateUrlSlug(page?.identifier ?? page?.slug ?? null);
    },
    [currentPage?.id, setDynamicPage],
  );

  /** Open whatever the user typed as the identifier, without verifying it exists. */
  const selectManualPage = useCallback(
    (rawIdentifier: string) => {
      const manualPage = createManualDynamicPage(rawIdentifier, effectiveLang);
      if (!manualPage) return;
      setDynamicPage({ ...manualPage, pageId: currentPage?.id });
      setIsLangMissing(false);
      setFailedLookupIdentifier(null);
      setSearchQuery("");
      updateUrlSlug(manualPage.identifier);
    },
    [currentPage?.id, effectiveLang, setDynamicPage],
  );

  const updateSearchQuery = useCallback((query: string) => setSearchQuery(query), []);

  return {
    isFetching,
    dynamicPage,
    searchQuery,
    selectedLang,
    dynamicPages,
    allLangPages,
    isLangMissing,
    failedLookupIdentifier,
    updateDynamicPage,
    selectManualPage,
    updateSearchQuery,
  };
};
