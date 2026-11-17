import { find } from "lodash-es";
import { useMemo } from "react";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";

export const useCurrentLanguagePage = () => {
  const { selectedLang, fallbackLang } = useLanguages();
  const { data: languagePages, isFetching } = useChaiLanguagePages();
  const { data: primaryPage } = usePrimaryPage();

  const data = useMemo(() => {
    const pages = languagePages ?? [];

    if (!selectedLang) {
      // Default language pages are stored with lang "" or the fallback code in DB.
      const defaultPage = find(pages, (p) => p.lang === fallbackLang || p.lang === "" || !p.primaryPage);
      if (defaultPage) return defaultPage;
      return primaryPage?.id ? primaryPage : {};
    }

    const page = find(pages, { lang: selectedLang });
    return page ?? {};
  }, [languagePages, selectedLang, fallbackLang, primaryPage]);

  return { data, isFetching };
};
