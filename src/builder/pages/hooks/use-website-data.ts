import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";

export const useWebsiteData = () => {
  const fetchApi = useFetch();
  const apiUrl = useChaiApiUrl();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [ACTIONS.GET_WEBSITE_DATA],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const data = await fetchApi(apiUrl, { action: ACTIONS.GET_WEBSITE_DATA });
      queryClient.setQueryData([ACTIONS.GET_WEBSITE_DRAFT_SETTINGS], (data as any).websiteSettings);
      queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], (data as any).websitePages);
      queryClient.setQueryData([ACTIONS.GET_PAGE_TYPES], (data as any).pageTypes);
      queryClient.setQueryData([ACTIONS.GET_LIBRARIES], (data as any).libraries);
      queryClient.setQueryData([ACTIONS.GET_COLLECTIONS], (data as any).collections);
      queryClient.setQueryData([ACTIONS.GET_REPEATER_DATA], (data as any).repeaterData);

      return data as any;
    },
  });
};
