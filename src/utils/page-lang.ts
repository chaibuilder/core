import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";

/**
 * Language facts about the page an AI or MCP tool is operating on.
 *
 * A ChaiBuilder site has one fallback language; page rows in that language
 * store `lang: ''` and every other language is a separate row pointing at the
 * primary page through `primaryPage`. Those language rows have no blocks of
 * their own — they share the primary page's block tree, and per-language text
 * lives on the same blocks under `-{lang}`-suffixed props (see
 * `applyLanguage`).
 */
export type PageLangInfo = {
  lang: string;
  fallbackLang: string;
  /** True when this page row is a language variant, not the primary-language page. */
  isLanguageVariant: boolean;
};

type LangSource = { lang?: string | null; fallbackLang?: string | null };

export const getPageLangInfo = (page: LangSource): PageLangInfo => {
  const fallbackLang = page.fallbackLang || "";
  const lang = page.lang || fallbackLang;
  return {
    lang,
    fallbackLang,
    isLanguageVariant: Boolean(lang && fallbackLang) && lang !== fallbackLang,
  };
};

/** "French (fr)" when the code is known, otherwise the bare code. @internal */
export const langLabel = (code: string): string => {
  if (!code) return "unknown";
  const name = LANGUAGES[code] ?? LANGUAGES[code.split("-")[0]];
  return name ? `${name} (${code})` : code;
};

const VARIANT_NOTE =
  "This page is a language variant: it shares one block tree with the primary-language page, so layout, structure and styling changes apply to every language. Its text is this language’s translation — the read tools show it and text edits here update only this language’s copy, leaving the primary-language text unchanged.";

/** Human-readable language note appended to read-tool output. @internal */
export const describePageLang = (info: PageLangInfo): string => {
  if (!info.lang) return "";
  const base = `Content language: ${langLabel(info.lang)}. Write all user-visible copy in this language.`;
  if (!info.isLanguageVariant) return base;
  return `${base} Site fallback language: ${langLabel(info.fallbackLang)}. ${VARIANT_NOTE}`;
};

/** Same facts as JSON fields, for the tools that answer with a JSON payload. */
export const langResponseFields = (info: PageLangInfo) => ({
  lang: info.lang,
  fallbackLang: info.fallbackLang,
  isLanguageVariant: info.isLanguageVariant,
  languageNote: describePageLang(info),
});
