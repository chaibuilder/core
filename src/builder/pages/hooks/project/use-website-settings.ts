import { useQuery } from "@tanstack/react-query";
import { defaultThemeValues } from "~/builder/hooks/default-theme-options";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { ChaiSiteSettings } from "~/types/actions";
import { useChaiApiUrl } from "./use-builder-prop";

export const useChaiSiteSettings = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery<ChaiSiteSettings>({
    queryKey: [ACTIONS.GET_WEBSITE_DRAFT_SETTINGS],
    staleTime: 5 * 60 * 1000,
    placeholderData: {
      languages: [],
      theme: defaultThemeValues,
      appKey: "",
      fallbackLang: "",
      settings: {},
      designTokens: {},
    },
    queryFn: async () => {
      return (await fetchAPI(apiUrl, {
        action: ACTIONS.GET_WEBSITE_DRAFT_SETTINGS,
        data: { draft: true },
      })) as ChaiSiteSettings;
    },
  });
};
