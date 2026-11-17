import { useQuery } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiApiUrl } from "./use-builder-prop";

export interface AppSharedJsonLD {
  id: string;
  name: string;
  description?: string;
  content: string;
  enabledByDefaultForNewPages: boolean;
}

export const useAppSharedJsonLD = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  return useQuery({
    queryKey: [ACTIONS.GET_APP_SHARED_JSONLD],
    queryFn: async () => {
      // @todo-jsonld Remove this add to use this pattern
      // {
      //   id: "1",
      //   name: "Default",
      //   description: "Default JSON-LD",
      //   content: '{ "@context": "https://schema.org/", "@graph": [] , "@version": 1 , "@type": "WebPage" }',
      //   enabledByDefaultForNewPages: true,
      // },
      const data = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_APP_SHARED_JSONLD,
      });
      return data || [];
    },
    placeholderData: [],
    staleTime: 60 * 60 * 1000,
    retry: 2,
  });
};
