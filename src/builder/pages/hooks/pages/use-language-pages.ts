import { useQuery } from "@tanstack/react-query";
import { reverse, sortBy } from "lodash-es";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";

export const useChaiLanguagePages = (pageId?: string | undefined) => {
  const apiUrl = useChaiApiUrl();
  const [searchParams] = useSearchParams();
  const page = pageId ?? searchParams.get("page");
  const fetchAPI = useFetch();

  return useQuery({
    queryKey: [ACTIONS.GET_LANGUAGE_PAGES, page],
    staleTime: Infinity,
    gcTime: 0,
    placeholderData: [],
    queryFn: async () => {
      if (!page) return null;
      const data = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_LANGUAGE_PAGES,
        data: { id: page },
      });
      return reverse(sortBy(data as any[], "primaryPage")) as any[];
    },
    enabled: !!page,
  });
};
