import { useMemo } from "react";
import { useChaiSiteSettings } from "./project/use-website-settings";

export const useChaiFallbackLang = () => {
  const { data: websiteConfig } = useChaiSiteSettings();
  const fallbackLang = useMemo(() => websiteConfig?.fallbackLang || "en", [websiteConfig]);
  return fallbackLang;
};
