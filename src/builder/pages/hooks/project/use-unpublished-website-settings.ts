import { useChaiSiteSettings } from "./use-website-settings";

export const useUnpublishedWebsiteSettings = () => {
  const { data, isLoading } = useChaiSiteSettings();
  const changes = data?.appChanges;

  const hasUnpublishedTheme = changes?.includes("THEME");

  const hasUnpublishedDesignToken = changes?.includes("DESIGN_TOKENS");

  const hasUnpublishedSettings = hasUnpublishedTheme || hasUnpublishedDesignToken;

  return {
    hasUnpublishedSettings,
    hasUnpublishedTheme,
    hasUnpublishedDesignToken,
    isLoading,
  };
};
