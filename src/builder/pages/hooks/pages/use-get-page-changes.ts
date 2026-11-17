import { useQuery } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";

export const useGetPageChanges = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_CHANGES],
    queryFn: async () => {
      return fetchAPI(apiUrl, { action: ACTIONS.GET_CHANGES }) as Promise<any[]>;
    },
  });
};
