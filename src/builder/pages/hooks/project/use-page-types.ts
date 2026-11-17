import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiPrimaryPages as useWebsitePages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { ChaiPageType } from "~/types/actions";
import { useChaiApiUrl } from "./use-builder-prop";

export const useChaiPageTypes = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery<ChaiPageType[]>({
    queryKey: [ACTIONS.GET_PAGE_TYPES],
    staleTime: Infinity,
    placeholderData: [],
    queryFn: async (): Promise<ChaiPageType[]> => {
      return fetchAPI(apiUrl, { action: ACTIONS.GET_PAGE_TYPES }) as Promise<ChaiPageType[]>;
    },
  });
};

export const usePageType = (pageType: string) => {
  const { data: pageTypes } = useChaiPageTypes();
  return useMemo(() => pageTypes?.find((type: ChaiPageType) => type.key === pageType), [pageTypes, pageType]);
};

export const useSearchPageTypePages = () => {
  const { data: primaryPages } = useWebsitePages();
  const searchPages = useCallback(
    async (_pageType: string, query: string | string[]) => {
      if (!primaryPages || !query) return [];

      // When query is an array (ID lookup during initialization)
      if (Array.isArray(query)) {
        return primaryPages.filter((page: any) => query.includes(page.id));
      }

      // Normal text search — exclude partials (no slug) and dynamic pages
      const lowerQuery = query.toLowerCase();
      return primaryPages.filter(
        (page: any) =>
          page.slug &&
          !page.dynamic &&
          (page.id === query ||
            (page.name || "").toLowerCase().includes(lowerQuery) ||
            (page.slug || "").toLowerCase().includes(lowerQuery)),
      );
    },
    [primaryPages],
  );

  return { searchPages };
};
