import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";

/**
 * Imports a remote image into the app's assets via the DOWNLOAD_SEARCH_IMAGE
 * action. Dispatches by action name: the action ships with the media-search
 * plugin, so without it (OSS core) the request fails with a not-found error.
 * Used by the uploader's URL import and the stock-image search tab.
 */
export const useDownloadSearchImage = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      asset: {
        url: string;
        name: string;
        description?: Record<string, string>;
        /** Omitted by the stock-image tab, which has no toggle; the action defaults it on. */
        optimize?: boolean;
      } & Record<string, unknown>,
    ) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.DOWNLOAD_SEARCH_IMAGE,
        data: {
          url: asset.url,
          name: asset.name,
          description: asset.description || { en: asset.name },
          optimize: asset.optimize,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_ASSETS] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Something went wrong. Please try again");
    },
  });
};
