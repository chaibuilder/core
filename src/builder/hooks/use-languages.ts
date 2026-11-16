import { atom, useAtom } from "jotai";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";

/** Language being edited; "" means the fallback language. */
export const selectedLanguageAtom = atom("");
selectedLanguageAtom.debugLabel = "selectedLanguageAtom";

export const useLanguages = () => {
  const languages = useBuilderProp("languages", [] as string[]);
  const fallbackLang = useBuilderProp("fallbackLang", "en");
  const [selectedLang, _setSelectedLang] = useAtom(selectedLanguageAtom);

  const setSelectedLang = (lang: string) => {
    _setSelectedLang(fallbackLang === lang ? "" : lang);
  };

  return {
    languages: languages?.filter((_lang) => _lang !== fallbackLang),
    fallbackLang,
    selectedLang,
    setSelectedLang,
  };
};
