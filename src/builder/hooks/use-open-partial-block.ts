import { noop } from "lodash-es";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSavePage } from "~/builder/hooks/use-save-page";

export const useOpenPartialBlock = (partialBlockId: string) => {
  const { t } = useTranslation();
  const gotoPage = useBuilderProp("gotoPage", noop);
  const { saveState, savePageAsync } = useSavePage();
  const { selectedLang, fallbackLang } = useLanguages();
  return useCallback(async () => {
    // Navigating into a partial/global requires the current page to be
    // persisted first, otherwise the destination loads stale blocks.
    if (saveState === "SAVING") {
      return false;
    }
    if (saveState === "UNSAVED") {
      try {
        await savePageAsync();
      } catch (error) {
        console.error("Failed to save page before opening partial block", error);
        toast.error(t("Could not save the page. Please try again."));
        return false;
      }
    }
    gotoPage({ pageId: partialBlockId, lang: selectedLang || fallbackLang });
    return true;
  },[saveState, savePageAsync, gotoPage, partialBlockId, selectedLang, fallbackLang, t]);
};
