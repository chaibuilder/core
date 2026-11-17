import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { resolveBinding } from "~/render/binding-engine";
import type { ChaiBlock } from "~/types/common";
import { useChaiActivePage, usePrimaryPage } from "./pages/use-current-page";
import { useChaiPageBindingData } from "./pages/use-page-draft-blocks";
import { useChaiSiteGlobalData } from "./pages/use-site-global-data";
import { useChaiApiUrl } from "./project/use-builder-prop";
import { useChaiSiteSettings } from "./project/use-website-settings";
import { useFetch } from "./utils/use-fetch";

const FILTER_BINDING_PATTERN = /\{\{.*\}\}/;

/**
 * Resolve {{...}} bindings in the block's filter values from the client-held
 * page external data before sending, so GET_BLOCK_ASYNC_PROPS doesn't have to
 * re-fetch page-type + global data server-side. Skipped while that data is
 * still loading — the server resolves any binding that slips through.
 */
const resolveFilterBindings = (
  block: ChaiBlock,
  externalData: Record<string, unknown> | undefined,
  locale: string,
): ChaiBlock => {
  const filters = block?.filters;
  if (!externalData || !Array.isArray(filters)) return block;
  if (!FILTER_BINDING_PATTERN.test(JSON.stringify(filters))) return block;
  return {
    ...block,
    filters: filters.map((filter) =>
      typeof filter?.value === "string" && FILTER_BINDING_PATTERN.test(filter.value)
        ? { ...filter, value: resolveBinding(filter.value, externalData, locale) }
        : filter,
    ),
  };
};

export const useChaiCollections = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_COLLECTIONS],
    staleTime: Infinity,
    queryFn: async () => {
      return fetchAPI(apiUrl, { action: ACTIONS.GET_COLLECTIONS });
    },
  });
};

export const useChaiRepeaterData = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_REPEATER_DATA],
    staleTime: Infinity,
    queryFn: async () => {
      return fetchAPI(apiUrl, { action: ACTIONS.GET_REPEATER_DATA });
    },
  });
};

export const useGetBlockAysncProps = () => {
  const { data: currentPage } = usePrimaryPage();
  const { data: activePage } = useChaiActivePage();
  const { data: websiteConfig } = useChaiSiteSettings();
  const { data: builderPageData } = useChaiPageBindingData();
  const { data: globalData } = useChaiSiteGlobalData();
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const fallbackLang = useMemo(() => websiteConfig?.fallbackLang || "en", [websiteConfig?.fallbackLang]);

  // Map to track in-progress requests by block ID + language
  const inProgressRequests = useRef(new Map<string, Promise<any>>());

  return useMutation({
    mutationFn: async ({ block }: { block: ChaiBlock }) => {
      const blockId = block._id;
      const lang = activePage?.lang || fallbackLang;
      const cacheKey = `${blockId}:${lang}`;

      // Check if there's already a request in progress for this block + lang combination
      if (inProgressRequests.current.has(cacheKey)) {
        return inProgressRequests.current.get(cacheKey);
      }

      const pageProps = {
        slug: activePage?.slug,
        searchParams: {},
        pageType: activePage?.pageType,
        fallbackLang,
        lastSaved: activePage.lastSaved,
        pageId: currentPage.id,
        primaryPageId: activePage.primaryPage || currentPage.id,
        pageBaseSlug: activePage?.slug,
        dynamic: currentPage?.dynamic,
        languagePageId: activePage.id,
      };

      const externalData =
        builderPageData === undefined || globalData === undefined
          ? undefined
          : { ...builderPageData, global: globalData, pageProps };

      // Create new request
      const requestPromise = fetchAPI(apiUrl, {
        action: ACTIONS.GET_BLOCK_ASYNC_PROPS,
        data: {
          block: resolveFilterBindings(block, externalData, lang),
          lang,
          pageProps,
        },
      });

      // Store the promise in the map
      inProgressRequests.current.set(cacheKey, requestPromise);

      // Clean up the request from the map when it completes (success or error)
      requestPromise.finally(() => {
        inProgressRequests.current.delete(cacheKey);
      });

      return requestPromise;
    },
  });
};
