import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import type { ChaiUpstreamPageOption } from "~/types/chaibuilder-config";

export type { ChaiUpstreamPageOption as UpstreamPage } from "~/types/chaibuilder-config";

/** Whether linked (upstream) pages are on: `features.upstreamPages`. */
export const useUpstreamPagesEnabled = (): boolean => {
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;
  return flags?.upstreamPages === true;
};

/** A page that renders its upstream page instead of its own blocks. */
export const isLinkedPage = (page: { upstream?: string | null; useUpstream?: boolean } | null | undefined) =>
  Boolean(page?.useUpstream && page?.upstream);

/** The upstream pages this site may link, from the host's LIST_UPSTREAM_PAGES action. */
export const useUpstreamPages = () => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    // The list depends on the site, and `apiUrl` is the same relative path on every site's editor.
    queryKey: [ACTIONS.LIST_UPSTREAM_PAGES, new URL(apiUrl, window.location.href).href],
    queryFn: async () => {
      const response = await fetchAPI(apiUrl, { action: ACTIONS.LIST_UPSTREAM_PAGES, data: {} });
      return (response as { pages: ChaiUpstreamPageOption[] } | null)?.pages ?? [];
    },
  });
};

const useUpstreamMutation = (action: string, successMessage: string) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => fetchAPI(apiUrl, { action, data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_WEBSITE_PAGES] });
      queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_PAGE_ALL_DATA] });
      queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_CHANGES], refetchType: "all" });
      toast.success(successMessage);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

/** Copy the upstream page's content into the linked page so it can be edited. */
export const useCloneUpstreamPage = () =>
  useUpstreamMutation(ACTIONS.CLONE_UPSTREAM_PAGE, "Page duplicated. Publish it to make your copy live.");

/** Discard the page's own copy and render the upstream page again. */
export const useResetToUpstream = () => {
  const label = useFeatureLabel("upstreamPage");
  return useUpstreamMutation(ACTIONS.RESET_TO_UPSTREAM, `Page reset to ${label}. Publish it to make it live.`);
};
