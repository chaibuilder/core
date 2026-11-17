import { get } from "lodash-es";
import { useMemo } from "react";
import { usePagesProps } from "~/builder/pages/hooks/utils/use-pages-props";

export const usePagesProp = <T>(key: string, defaultValue?: T) => {
  const [pagesProps] = usePagesProps();
  return useMemo(() => get(pagesProps, key, defaultValue), [pagesProps, key, defaultValue]);
};

const DEFAULT_ACTION_MODEL = "google/gemini-3-flash";

/**
 * Get the AI model for a specific action.
 * Looks up actionModels config to find which model handles the given action.
 * Actions: 'AI_ENHANCE_CONTEXT', 'AI_GENERATE_THEME', 'AI_GENERATE_SEO_FIELD', 'AI_GENERATE_IMAGE_DESCRIPTION', 'AI_GENERATE_IMAGE'
 */
export const useAIActionModel = (action: string, defaultModel?: string): string => {
  const actionModels = usePagesProp<Record<string, string[]>>("ai.actionModels", {});

  return useMemo(() => {
    const upperAction = action.toUpperCase();
    // Find first model that includes this action
    for (const [model, actions] of Object.entries(actionModels)) {
      const actionsArr = actions as string[];
      if (actionsArr.some((a: string) => a.toUpperCase() === upperAction)) {
        return model;
      }
    }
    return defaultModel || DEFAULT_ACTION_MODEL;
  }, [actionModels, action, defaultModel]);
};

export const useChaiApiUrl = () => {
  return usePagesProp("apiUrl", "/chai/api") as string;
};

/**
 * @returns Supabase RealtimeClient or null
 */
export const useWebsocket = () => {
  // Using any because this is a legacy API that accepts Supabase RealtimeClient
  // which is not imported here to avoid hard dependency
  return usePagesProp("websocket", null) as any | null;
};
