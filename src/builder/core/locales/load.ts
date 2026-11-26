import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import lngEn from "~/builder/core/locales/en.json";
import lngEs from "~/builder/core/locales/es.json";

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    // the translations
    // (tip move them in a JSON file and import them,
    // or even better, manage them via a UI: https://react.i18next.com/guides/multiple-translation-files#manage-your-translations-with-a-management-gui)
    resources: {
      en: {
        translation: lngEn,
      },
      es: {
        translation: lngEs,
      },
    },
    lng: "en", // if you're using a language detector, do not define the lng option
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
    react: {
      bindI18nStore: "added",
    },
  });

export const syncEditorLocale = (
  locale?: string,
  translations?: Record<string, Record<string, unknown>>,
) => {
  if (translations) {
    for (const [lng, bundle] of Object.entries(translations)) {
      i18n.addResourceBundle(lng, "translation", bundle, true, true);
    }
  }
  const targetLocale = locale || "en";
  if (i18n.language !== targetLocale) {
    i18n.changeLanguage(targetLocale);
  }
};

export default i18n;
