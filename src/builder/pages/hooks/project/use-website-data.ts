import { useQuery } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiApiUrl } from "./use-builder-prop";

export const useWebsiteData = () => {
  const fetchAPI = useFetch();
  const apiUrl = useChaiApiUrl();
  return useQuery<any>({
    queryKey: [ACTIONS.GET_WEBSITE_DATA],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.GET_WEBSITE_DATA,
        data: { draft: true },
      });
    },
  });
};
