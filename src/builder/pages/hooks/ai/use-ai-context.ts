import { useQuery } from "@tanstack/react-query";
import { readChaiDesignSystem, readChaiPageDesignBrief } from "~/server/chai-actions/ai/design-system-schema";
import { ChaiAiContext } from "~/types";
import {
  CHAI_DESIGN_SYSTEM_KEY,
  CHAI_PAGE_DESIGN_BRIEF_KEY,
  type ChaiDesignSystem,
  type ChaiPageDesignBrief,
} from "~/types/design-system";
import { withoutPageDesignKeys, withoutSiteDesignKeys } from "~/utils/design-context";
import { ACTIONS } from "../../constants/ACTIONS";
import { useChaiActivePage as useActivePage } from "../pages/use-current-page";
import { useChaiActionFetch } from "../utils/use-fetch";

export const AI_CONTEXT_QUERY_KEY = "AI_CONTEXT";

type RawAiContextPayload = { app: any; page: any } | null;

function useRawAiContextQuery<TSelected>(select: (raw: RawAiContextPayload) => TSelected) {
  const { data: activePage } = useActivePage();
  const builderFetch = useChaiActionFetch();

  return useQuery<RawAiContextPayload, Error, TSelected>({
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
        return { app: result.aiData.app, page: result.aiData.page };
      }
      return null;
    },
    select,
    enabled: !!activePage?.id,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useAiContext() {
  return useRawAiContextQuery<ChaiAiContext | null>((raw) => {
    if (!raw) return null;
    // Context modal and small text actions keep design keys out of their payload.
    return {
      site: withoutSiteDesignKeys(raw.app),
      page: withoutPageDesignKeys(raw.page),
    };
  });
}

export type BuilderAiDesignContext = {
  designSystem: ChaiDesignSystem | null;
  designBrief: ChaiPageDesignBrief | null;
  bannedWords: string | string[] | null;
};

/**
 * Reads the site design system, page brief, and banned words from the shared
 * `AI_CONTEXT` query cache without triggering a second network request.
 */
export function useAiDesignContext() {
  return useRawAiContextQuery<BuilderAiDesignContext>((raw) => {
    const app = raw?.app && typeof raw.app === "object" ? (raw.app as Record<string, unknown>) : {};
    const page = raw?.page && typeof raw.page === "object" ? (raw.page as Record<string, unknown>) : {};
    const bannedWords = app.bannedWords;
    return {
      designSystem: readChaiDesignSystem(app[CHAI_DESIGN_SYSTEM_KEY]),
      designBrief: readChaiPageDesignBrief(page[CHAI_PAGE_DESIGN_BRIEF_KEY]),
      bannedWords:
        typeof bannedWords === "string" || Array.isArray(bannedWords) ? (bannedWords as string | string[]) : null,
    };
  });
}
