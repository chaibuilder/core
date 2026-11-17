import { useDebouncedCallback } from "@react-hookz/web";
import { useCallback, useRef } from "react";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { builderStore } from "~/builder/atoms/store";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useTheme } from "~/builder/hooks/use-theme";
import { ChaiDesignTokens, ChaiSaveSiteArgs, ChaiTheme } from "~/types";

export const useSaveWebsiteData = () => {
  const onSaveWebsiteData = useBuilderProp<(data: ChaiSaveSiteArgs) => Promise<boolean | Error>>(
    "onSaveWebsiteData",
    async (_data: ChaiSaveSiteArgs) => true,
  );
  const [theme] = useTheme();
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const saveWebsiteData = useCallback(
    (data: ChaiSaveSiteArgs) => {
      const save = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await onSaveWebsiteData(data);
          if (result instanceof Error) throw result;
        });
      saveQueueRef.current = save.catch(() => undefined);
      return save;
    },
    [onSaveWebsiteData],
  );

  const saveTheme = useCallback(
    async (themeData?: ChaiTheme) => {
      await saveWebsiteData({ type: "THEME", data: themeData ?? theme });
    },
    [saveWebsiteData, theme],
  );

  const saveDesignTokens = useCallback(
    async (tokens?: ChaiDesignTokens) => {
      // Get latest from store if not provided
      const data = tokens ?? builderStore.get(chaiDesignTokensAtom);
      await saveWebsiteData({ type: "DESIGN_TOKENS", data });
    },
    [saveWebsiteData],
  );

  const saveThemeAndDesignTokens = useCallback(
    async (themeData: ChaiTheme, designTokens: ChaiDesignTokens) => {
      await saveWebsiteData({
        type: "THEME_AND_DESIGN_TOKENS",
        data: { theme: themeData, designTokens },
      });
    },
    [saveWebsiteData],
  );

  const debouncedSaveTheme = useDebouncedCallback(saveTheme, [saveTheme], 1000);

  const debouncedSaveDesignTokens = useDebouncedCallback(saveDesignTokens, [saveDesignTokens], 1000);

  return {
    saveWebsiteData,
    saveTheme,
    saveDesignTokens,
    saveThemeAndDesignTokens,
    debouncedSaveTheme,
    debouncedSaveDesignTokens,
  };
};
