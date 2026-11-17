import { useQuery } from "@tanstack/react-query";
import { isEmpty } from "lodash-es";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "./use-fetch";

export const useChaiUserInfo = (currentEditor: string) => {
  const apiURL = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_CHAI_USER, currentEditor],
    queryFn: async () => {
      const data = await fetchAPI(apiURL, {
        action: ACTIONS.GET_CHAI_USER,
        data: { userId: currentEditor },
      });
      const userInfo = (data as any)?.data || {};
      return {
        id: userInfo.id,
        name: userInfo.name || userInfo.email,
        email: userInfo.email,
        avatar: userInfo.avatar,
      };
      return { ...userInfo, name: userInfo.name || userInfo.email };
    },
    enabled: !isEmpty(currentEditor),
    staleTime: "static",
  });
};
