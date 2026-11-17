import { atom, useAtom } from "jotai";
import { find } from "lodash-es";
import { useCallback, useMemo } from "react";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { useDynamicPageSlug } from "./use-dynamic-page-selector";
import { useChaiLanguagePages } from "./use-language-pages";
import { useWebsiteLanguagePages, useChaiPrimaryPages } from "./use-project-pages";

const pageEditInfoAtom = atom<{
  lastSaved?: string;
}>({ lastSaved: undefined });

export const usePageEditInfo = () => {
  return useAtom(pageEditInfoAtom);
};

export const useChaiCurrentPage = () => {
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");
  const { data: pages, isFetching } = useChaiLanguagePages();
  const currentPage = useMemo(() => {
    const match = pages?.find((p) => p.id === page);
    return match ? { ...match } : {};
  }, [pages, page]);

  return { data: currentPage as any, isFetching };
};

export const usePrimaryPage = () => {
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");
  const { data: pages, isFetching } = useChaiPrimaryPages();
  const currentPage = useMemo(() => {
    const match = pages?.find((p) => p.id === page);
    return match ? { ...match } : {};
  }, [pages, page]);
  return { data: currentPage as any, isFetching };
};

export const useChaiActivePage = () => {
  const [searchParams] = useSearchParams();
  const lang = searchParams.get("lang") ?? "";
  const page = searchParams.get("page");
  const { data: languagePages, isFetching } = useWebsiteLanguagePages(lang);
  const { data: primaryPages } = useChaiPrimaryPages();
  const { data: pageTypes } = useChaiPageTypes();
  const currentPage = useMemo(() => {
    const primaryRecord = primaryPages?.find((p) => p.id === page);
    const pageTypeConfig = find(pageTypes, { key: primaryRecord?.pageType });
    const isPartial = pageTypeConfig?.hasSlug === false;

    if (isPartial || lang == "") {
      return primaryRecord ? { ...primaryRecord } : {};
    }

    const languagePage = languagePages
      ? Object.values(languagePages).find((p) => p.lang === lang && p.primaryPage === page)
      : undefined;
    return languagePage ? { ...languagePage } : {};
  }, [languagePages, primaryPages, lang, page, pageTypes]);
  return { data: currentPage as any, isFetching };
};

const pageMetaDataAtom = atom<Record<string, any>>({});
export const usePageMetaData = () => {
  return useAtom(pageMetaDataAtom);
};

/**
 * Helper to append dynamic slug to a base URL
 */
const appendDynamicSlug = (baseUrl: string, dynamicSlug: string) => {
  if (!dynamicSlug) return baseUrl;
  const separator = baseUrl.endsWith("/") ? "" : "/";
  const cleanedDynamicSlug = dynamicSlug.startsWith("/") ? dynamicSlug.slice(1) : dynamicSlug;
  return baseUrl + separator + cleanedDynamicSlug;
};

/**
 *
 * @returns full url of the current page
 */
export const useGetPageFullSlug = () => {
  const { selectedLang, fallbackLang } = useLanguages();
  const { data: activePage } = useChaiActivePage();
  const { data: currentPage } = usePrimaryPage();
  const { data: pageTypes } = useChaiPageTypes();
  const dynamicPageSlug = useDynamicPageSlug();
  const getLiveUrl = usePagesProp("getLiveUrl", (s: string) => s);

  const hasSlug = useCallback((pageType: string) => find(pageTypes, { key: pageType })?.hasSlug, [pageTypes]);
  const pageLang = selectedLang === fallbackLang ? "" : selectedLang;

  return useMemo(() => {
    const isPartial = !hasSlug(currentPage?.pageType);
    const slug = activePage?.slug;
    const url = getLiveUrl(
      isPartial ? `/_partial/${pageLang !== "" ? pageLang + "/" : ""}${currentPage?.id}` : slug || "/",
    );

    if (activePage?.dynamic && dynamicPageSlug) {
      return appendDynamicSlug(url, dynamicPageSlug);
    }
    return url;
  }, [getLiveUrl, activePage, currentPage, hasSlug, pageLang, dynamicPageSlug]);
};

export const useGetPagePreviewUrl = () => {
  const { selectedLang, fallbackLang } = useLanguages();
  const getPreviewUrl = usePagesProp("getPreviewUrl", (s: string) => s);

  const { data: currentPage } = usePrimaryPage();
  const { data: languagePages } = useChaiLanguagePages();
  const { data: pageTypes } = useChaiPageTypes();
  const dynamicPageSlug = useDynamicPageSlug();

  const slug = useMemo(
    () => languagePages?.find((page: any) => page?.lang === selectedLang)?.slug,
    [selectedLang, languagePages],
  );

  const hasSlug = useCallback((pageType: string) => find(pageTypes, { key: pageType })?.hasSlug, [pageTypes]);
  const pageLang = selectedLang === fallbackLang ? "" : selectedLang;

  return useMemo(() => {
    if (typeof getPreviewUrl !== "function") return "";
    const isPartial = !hasSlug(currentPage?.pageType);
    const url = getPreviewUrl(
      isPartial ? `/_partial/${pageLang !== "" ? pageLang + "/" : ""}${currentPage?.id}` : slug || "",
    );
    if (url && currentPage?.dynamic && dynamicPageSlug) {
      return appendDynamicSlug(url, dynamicPageSlug);
    }
    return url;
  }, [
    getPreviewUrl,
    slug,
    currentPage?.pageType,
    hasSlug,
    currentPage?.id,
    pageLang,
    dynamicPageSlug,
    currentPage?.dynamic,
  ]);
};
