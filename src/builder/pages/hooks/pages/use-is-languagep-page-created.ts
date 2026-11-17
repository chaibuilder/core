import { each, get, isEmpty } from "lodash-es";

import { find } from "lodash-es";
import { useMemo } from "react";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useChaiSiteSettings } from "~/builder/pages/hooks/project/use-website-settings";

export const useIsLanguagePageCreated = (lang: string) => {
  const { fallbackLang } = useLanguages();
  const { data: websiteSettings } = useChaiSiteSettings();
  const { data: languagePages, isFetching: isFetchingLanguagePages } = useChaiLanguagePages();

  const languageOptions = useMemo(() => {
    const langPages = { [fallbackLang]: true };
    each(get(websiteSettings, "languages"), (langCode) => {
      const langPage = find(languagePages, { lang: langCode });
      langPages[langCode as string] = Boolean(langPage);
    });
    return langPages;
  }, [fallbackLang, languagePages, websiteSettings]);

  const { data: pageTypes } = useChaiPageTypes();
  const { data: currentPage } = usePrimaryPage();

  const isPartial = useMemo(() => {
    const pageTypeConfig = find(pageTypes, { key: currentPage?.pageType });
    return pageTypeConfig?.hasSlug === false;
  }, [currentPage?.pageType, pageTypes]);

  return isFetchingLanguagePages || isPartial || isEmpty(lang) || (lang && languageOptions[lang]);
};
