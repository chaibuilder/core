import { useQueryClient } from "@tanstack/react-query";
import { useQuerySync } from "~/builder/hooks/use-query-sync";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { usePageEditInfo } from "~/builder/pages/hooks/pages/use-current-page";
import { useApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { ChaiBlock } from "~/types/common";
import { ChaiDesignTokens } from "~/types/types";
import { useFetch } from "./use-fetch";

export const usePagesSavePage = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const [, setPageEditInfo] = usePageEditInfo();
  const queryClient = useQueryClient();
  const { handleQuerySync } = useQuerySync();

  const onSave = async ({
    page,
    blocks,
    needTranslations,
    partialIds,
    linkPageIds,
    designTokens,
  }: {
    page: string;
    blocks: ChaiBlock[] | any;
    needTranslations?: boolean;
    partialIds?: string[];
    linkPageIds?: string[];
    designTokens?: ChaiDesignTokens;
  }) => {
    try {
      const response = await fetchAPI(apiUrl, {
        action: "UPDATE_PAGE",
        // Whether this save snapshots a draft revision is decided server-side
        // from `features.revisions.drafts`, so every UPDATE_PAGE client (the
        // MCP tools included) writes the same history.
        data: { id: page, blocks, needTranslations, partialIds, linkPageIds, designTokens },
      });
      // if response has code and value is PAGE_LOCKED, throw an error
      if ((response as any).code === "PAGE_LOCKED") {
        return true;
      }
      setPageEditInfo((prev) => ({
        ...prev,
        lastSaved: new Date().toISOString(),
      }));
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });
      queryClient.setQueryData([ACTIONS.GET_LANGUAGE_PAGES, page], (oldData: any[] | undefined) => {
        if (!oldData) return oldData;
        return oldData?.map((item: any) => (item?.id === page ? { ...item, changes: ["Page"] } : item));
      });
      // Emit sync event for page save - syncs blocks, links, partials, design tokens, and site-wide usage
      handleQuerySync({
        type: "UPDATE_PAGE_DATA",
        data: {
          pageId: page,
          partialIds,
          linkPageIds,
          designTokens,
        },
        sync: true,
      });

      return response;
    } catch (error) {
      console.error(error);
      return new Error("Failed to save blocks");
    }
  };

  return { onSave };
};
