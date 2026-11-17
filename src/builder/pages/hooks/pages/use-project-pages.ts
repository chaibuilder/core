import { useQuery } from "@tanstack/react-query";
import { keyBy, map } from "lodash-es";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { ChaiPage } from "~/builder/pages/utils/page-organization";

export const useChaiPrimaryPages = () => {
  const fetchApi = useFetch();
  const apiUrl = useChaiApiUrl();

  return useQuery<ChaiPage[]>({
    queryKey: [ACTIONS.GET_WEBSITE_PAGES],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const data = await fetchApi(apiUrl, { action: ACTIONS.GET_WEBSITE_PAGES });
      return (data || []) as ChaiPage[];
    },
    placeholderData: (prevData) => prevData || [],
  });
};

export const useWebsiteLanguagePages = (lang: string) => {
  const fetchApi = useFetch();
  const apiUrl = useChaiApiUrl();
  const fallbackLang = useChaiFallbackLang();
  return useQuery<Record<string, ChaiPage>>({
    queryKey: [ACTIONS.GET_WEBSITE_PAGES, lang, fallbackLang],
    staleTime: 1000 * 60 * 5,
    enabled: !!lang,
    queryFn: async () => {
      if (fallbackLang === lang) return {};
      const data =
        (await fetchApi(apiUrl, {
          action: ACTIONS.GET_WEBSITE_PAGES,
          data: { lang },
        })) || [];
      return keyBy(
        map(data, (page: ChaiPage) => ({ ...page, lang })),
        "primaryPage",
      );
    },
    placeholderData: (prevData) => prevData || {},
  });
};
