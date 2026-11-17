import { useQuery } from "@tanstack/react-query";
import { filter } from "lodash-es";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiApiUrl } from "./use-builder-prop";

export interface Template {
  id: string;
  name: string;
  description?: string;
  library: string;
  pageType: string;
  previewUrl?: string;
}

export const useTemplatesByType = (pageType?: string) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  return useQuery({
    queryKey: [ACTIONS.GET_TEMPLATES_BY_TYPE, pageType],
    staleTime: "static",
    enabled: !!pageType,
    queryFn: async () => {
      const data = (await fetchAPI(apiUrl, {
        action: ACTIONS.GET_TEMPLATES_BY_TYPE,
        data: { pageType },
      })) as any[];

      // Filter templates by pageType if needed (in case backend doesn't filter)
      const templates = pageType ? filter(data, { pageType }) : data;

      return templates || [];
    },
  });
};
