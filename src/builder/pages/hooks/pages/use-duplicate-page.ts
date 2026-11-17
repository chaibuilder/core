import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import type { DuplicatePageVariant } from "~/server/chai-actions/pages/duplicate-page";

export const useDuplicatePage = () => {
  const apiUrl = useChaiApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();

  return useMutation({
    mutationFn: async ({
      pageId,
      name,
      slug,
      variants,
    }: {
      pageId: string;
      name: string;
      slug?: string;
      variants?: DuplicatePageVariant[];
    }) => {
      // Create payload with required fields
      const data: { pageId: string; name: string; slug?: string; variants?: DuplicatePageVariant[] } = {
        pageId,
        name,
      };

      // Only include slug in the payload if it's provided
      if (slug) {
        data.slug = slug;
      }

      if (variants?.length) {
        data.variants = variants;
      }

      const response = await fetchAPI(apiUrl, {
        action: "DUPLICATE_PAGE",
        data,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_WEBSITE_PAGES],
      });
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_LANGUAGE_PAGES],
      });
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });
      toast.success("Page duplicated successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to duplicate page", {
        description: error.message || "An error occurred while duplicating the page",
      });
    },
  });
};
