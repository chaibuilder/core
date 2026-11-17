import { useQuery } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiApiUrl } from "./use-builder-prop";

export interface Library {
  id: string;
  name: string;
  description?: string;
  type: string;
}

export const useLibraries = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  return useQuery<Library[]>({
    queryKey: [ACTIONS.GET_LIBRARIES],
    staleTime: "static",
    queryFn: async () => {
      const data = await fetchAPI(apiUrl, { action: ACTIONS.GET_LIBRARIES });
      return (data || []) as Library[];
    },
  });
};

export const useLibraryItems = (libraryId: string) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_LIBRARY_ITEMS, libraryId],
    staleTime: "static",
    placeholderData: [],
    queryFn: async () => {
      if (!libraryId) return [];
      return fetchAPI(apiUrl, {
        action: ACTIONS.GET_LIBRARY_ITEMS,
        data: { id: libraryId },
      }) as Promise<any[]>;
    },
    enabled: !!libraryId,
  });
};

export const useLibraryItem = (itemId: string) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: [ACTIONS.GET_LIBRARY_ITEM, itemId],
    staleTime: "static",
    placeholderData: {},
    queryFn: async () => {
      if (!itemId) return {};
      return fetchAPI(apiUrl, {
        action: ACTIONS.GET_LIBRARY_ITEM,
        data: { itemId },
      }) as Promise<any>;
    },
    enabled: !!itemId,
  });
};
