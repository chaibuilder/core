import { useQuery } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiActivePage } from "./use-current-page";

/**
 * React Query hook to fetch site-wide global data.
 * Global data is the same for all pages and is cached per language.
 * Populated automatically by usePageAllData on initial load.
 */
export const useChaiSiteGlobalData = () => {
  const { data: activePage } = useChaiActivePage();
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const fallbackLang = useChaiFallbackLang();
  const lang = activePage?.lang || fallbackLang;

  return useQuery<Record<string, unknown>>({
    queryKey: [ACTIONS.GET_SITE_GLOBAL_DATA, lang],
    staleTime: Infinity,
    gcTime: 0,
    placeholderData: (previousData) => previousData,
    queryFn: async () =>
      fetchAPI(apiUrl, {
        action: ACTIONS.GET_SITE_GLOBAL_DATA,
        data: { lang },
      }) as Promise<Record<string, unknown>>,
    enabled: !!lang,
  });
};
