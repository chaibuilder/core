import { useQuery } from "@tanstack/react-query";
import { ChaiAiContext } from "~/types";
import { withoutPageDesignKeys, withoutSiteDesignKeys } from "~/utils/design-context";
import { ACTIONS } from "../../constants/ACTIONS";
import { useChaiActivePage as useActivePage } from "../pages/use-current-page";
import { useChaiActionFetch } from "../utils/use-fetch";

export const AI_CONTEXT_QUERY_KEY = "AI_CONTEXT";

export function useAiContext() {
  const { data: activePage } = useActivePage();
  const builderFetch = useChaiActionFetch();

  return useQuery<ChaiAiContext | null>({
    queryKey: [AI_CONTEXT_QUERY_KEY, activePage?.id],
    queryFn: async () => {
      if (!activePage?.id) return null;
      const result = await builderFetch({
        body: {
          action: ACTIONS.AI_GET_CONTEXT,
          data: { pageId: activePage.id },
        },
      });

      if (result?.success && result.aiData) {
        const { app, page } = result.aiData;
        // The builder's AI flows do not use the design system yet: keep its keys out of the
        // context they send and out of the context modal (whose saves leave them in place).
        return {
          site: withoutSiteDesignKeys(app),
          page: withoutPageDesignKeys(page),
        };
      }
      return null;
    },
    enabled: !!activePage?.id,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
