import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiActivePage, usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { useBuilderPageProps } from "./use-builder-page-props";
import { useDynamicPageSlug } from "./use-dynamic-page-selector";

/**
 * Hook to fetch all page data in a single API call
 * Consolidates GET_DRAFT_PAGE, GET_BUILDER_PAGE_DATA, and GET_LANGUAGE_PAGES
 * Uses queryClient.setQueryData to populate individual caches for backward compatibility
 */
export const useChaiPageData = () => {
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();
  const { data: primaryPage } = usePrimaryPage();
  const { data: activePage } = useChaiActivePage();
  const fallbackLang = useChaiFallbackLang();
  const dynamicPageSlug = useDynamicPageSlug();
  const pageProps = useBuilderPageProps();

  return useQuery({
    queryKey: [ACTIONS.GET_PAGE_ALL_DATA, page, activePage?.id, dynamicPageSlug],
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      const data: any = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_PAGE_ALL_DATA,
        data: {
          id: page,
          lang: activePage?.lang || fallbackLang,
          pageType: primaryPage?.pageType,
          pageProps,
        },
      });

      // Populate individual query caches for backward compatibility
      // This allows useBuilderPageData() to work without changes
      queryClient.setQueryData([ACTIONS.GET_BUILDER_PAGE_DATA, activePage?.id, dynamicPageSlug], data.builderPageData);
      queryClient.setQueryData([ACTIONS.GET_LANGUAGE_PAGES, page], data.languagePages);
      queryClient.setQueryData([ACTIONS.GET_SITE_GLOBAL_DATA, activePage?.lang || fallbackLang], data.siteGlobalData);

      return data;
    },
    enabled: !!page && !!primaryPage?.pageType && !!activePage?.id,
  });
};

/**
 * Whether the identifier the builder asked for actually resolved to content.
 * Drives the overlay that stops the user editing a page whose data doesn't exist —
 * reachable now that identifiers can be typed by hand.
 */
export const useDynamicPageDataStatus = () => {
  const { data, isFetching } = useChaiPageData();

  return {
    isCheckingData: isFetching,
    isDataMissing: data?.dynamicDataFound === false,
    dataError: (data?.builderPageDataError as string | undefined) ?? undefined,
  };
};
