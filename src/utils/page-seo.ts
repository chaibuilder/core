import type { PageLangInfo } from "./page-lang";
import { langLabel } from "./page-lang";

/**
 * Read/write helpers for the `app_pages.seo` jsonb column — shared by Builder AI
 * and MCP `get_page_seo` / `update_page_seo` tools.
 */

export type SeoPatch = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  metaOther?: Record<string, string>;
  /** null / {} / [] clears the document. */
  jsonLD?: Record<string, unknown> | unknown[] | null;
};

export type NormalizedSeo = {
  seo: {
    title: string;
    description: string;
    canonicalUrl: string;
    noIndex: boolean;
    noFollow: boolean;
  };
  metaTags: {
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    metaOther: Record<string, string>;
  };
  jsonLD: Record<string, unknown> | unknown[] | null;
  jsonLDRaw?: string;
  metaOtherRaw?: string;
};

type ParseResult = { ok: true; patch: SeoPatch } | { ok: false; message: string };

export const SEO_PATCH_KEYS = [
  "title",
  "description",
  "canonicalUrl",
  "noIndex",
  "noFollow",
  "ogTitle",
  "ogDescription",
  "ogImage",
  "metaOther",
  "jsonLD",
] as const;

const TEXT_KEYS = ["title", "description", "canonicalUrl", "ogTitle", "ogDescription", "ogImage"] as const;
const BOOLEAN_KEYS = ["noIndex", "noFollow"] as const;
const URL_KEYS = ["canonicalUrl", "ogImage"] as const;

const MAX_TEXT_LEN = 2000;
const MAX_META_OTHER_ENTRIES = 50;
const MAX_JSONLD_CHARS = 50_000;
const EMPTY_JSON_OBJECT = "{}";

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const isEmptyJsonString = (value: string): boolean => ["", "{}", "[]"].includes(value.trim());

const stringPairsOnly = (source: Record<string, unknown>): Record<string, string> => {
  const pairs: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") pairs[key] = value;
  }
  return pairs;
};

const parseMetaOtherString = (value: string): { pairs: Record<string, string>; raw?: string } => {
  if (isEmptyJsonString(value)) return { pairs: {} };
  try {
    const parsed = JSON.parse(value);
    if (!isPlainRecord(parsed)) return { pairs: {}, raw: value };
    return { pairs: stringPairsOnly(parsed) };
  } catch {
    return { pairs: {}, raw: value };
  }
};

const isEmptyDocument = (value: Record<string, unknown> | unknown[]): boolean =>
  Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;

export const normalizeStoredSeo = (raw: unknown): NormalizedSeo => {
  const source = isPlainRecord(raw) ? raw : {};
  const canonicalUrl = asString(source.canonicalUrl) || asString(source.cononicalUrl);

  let metaOther: Record<string, string> = {};
  let metaOtherRaw: string | undefined;
  if (isPlainRecord(source.metaOther)) {
    metaOther = stringPairsOnly(source.metaOther);
  } else if (typeof source.metaOther === "string") {
    const parsed = parseMetaOtherString(source.metaOther);
    metaOther = parsed.pairs;
    metaOtherRaw = parsed.raw;
  }

  let jsonLD: Record<string, unknown> | unknown[] | null = null;
  let jsonLDRaw: string | undefined;
  const storedJsonLd = source.jsonLD;
  if (isPlainRecord(storedJsonLd) || Array.isArray(storedJsonLd)) {
    jsonLD = isEmptyDocument(storedJsonLd) ? null : storedJsonLd;
  } else if (typeof storedJsonLd === "string") {
    if (!isEmptyJsonString(storedJsonLd)) {
      try {
        const parsed = JSON.parse(storedJsonLd);
        if (isPlainRecord(parsed) || Array.isArray(parsed)) {
          jsonLD = isEmptyDocument(parsed) ? null : parsed;
        } else {
          jsonLDRaw = storedJsonLd;
        }
      } catch {
        jsonLDRaw = storedJsonLd;
      }
    }
  }

  return {
    seo: {
      title: asString(source.title),
      description: asString(source.description),
      canonicalUrl,
      noIndex: Boolean(source.noIndex),
      noFollow: Boolean(source.noFollow),
    },
    metaTags: {
      ogTitle: asString(source.ogTitle),
      ogDescription: asString(source.ogDescription),
      ogImage: asString(source.ogImage),
      metaOther,
    },
    jsonLD,
    ...(jsonLDRaw !== undefined ? { jsonLDRaw } : {}),
    ...(metaOtherRaw !== undefined ? { metaOtherRaw } : {}),
  };
};

const isAcceptableUrlValue = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (trimmed.startsWith("/")) {
    if (/^\/[/\\]/.test(trimmed)) return false;
    return true;
  }
  if (trimmed.startsWith("{{")) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
};

const parseMetaOtherArg = (
  value: unknown,
): { ok: true; pairs: Record<string, string> } | { ok: false; message: string } => {
  if (!isPlainRecord(value)) {
    return { ok: false, message: "Error: metaOther must be an object of meta name/content string pairs." };
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_META_OTHER_ENTRIES) {
    return { ok: false, message: `Error: metaOther accepts at most ${MAX_META_OTHER_ENTRIES} entries.` };
  }
  const pairs: Record<string, string> = {};
  for (const [key, entryValue] of entries) {
    if (key.trim() === "") return { ok: false, message: "Error: metaOther keys cannot be empty." };
    if (typeof entryValue !== "string") {
      return { ok: false, message: `Error: metaOther["${key}"] must be a string.` };
    }
    if (entryValue.length > MAX_TEXT_LEN) {
      return { ok: false, message: `Error: metaOther["${key}"] must be at most ${MAX_TEXT_LEN} characters.` };
    }
    pairs[key] = entryValue;
  }
  return { ok: true, pairs };
};

const parseJsonLdArg = (
  value: unknown,
): { ok: true; value: Record<string, unknown> | unknown[] | null } | { ok: false; message: string } => {
  if (value === null) return { ok: true, value: null };

  let document: unknown = value;
  if (typeof value === "string") {
    if (isEmptyJsonString(value)) return { ok: true, value: null };
    try {
      document = JSON.parse(value);
    } catch {
      return { ok: false, message: "Error: jsonLD is not valid JSON." };
    }
  }

  if (!isPlainRecord(document) && !Array.isArray(document)) {
    return {
      ok: false,
      message: "Error: jsonLD must be a JSON-LD object or an array of them, not a primitive value.",
    };
  }

  if (isEmptyDocument(document)) return { ok: true, value: null };

  const serialized = JSON.stringify(document);
  if (serialized.length > MAX_JSONLD_CHARS) {
    return { ok: false, message: `Error: jsonLD must serialize to at most ${MAX_JSONLD_CHARS} characters.` };
  }

  return { ok: true, value: document };
};

export const parseSeoPatch = (args: Record<string, unknown>): ParseResult => {
  const patch: SeoPatch = {};

  for (const key of TEXT_KEYS) {
    const value = args[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, message: `Error: ${key} must be a string.` };
    if (value.length > MAX_TEXT_LEN) {
      return { ok: false, message: `Error: ${key} must be at most ${MAX_TEXT_LEN} characters.` };
    }
    patch[key] = value;
  }

  for (const key of URL_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (!isAcceptableUrlValue(value)) {
      return {
        ok: false,
        message: `Error: ${key} must be an absolute http(s) URL, an absolute path starting with /, or a {{binding}} expression.`,
      };
    }
  }

  for (const key of BOOLEAN_KEYS) {
    const value = args[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { ok: false, message: `Error: ${key} must be true or false.` };
    patch[key] = value;
  }

  if (args.metaOther !== undefined) {
    const parsed = parseMetaOtherArg(args.metaOther);
    if (!parsed.ok) return parsed;
    patch.metaOther = parsed.pairs;
  }

  if (args.jsonLD !== undefined) {
    const parsed = parseJsonLdArg(args.jsonLD);
    if (!parsed.ok) return parsed;
    patch.jsonLD = parsed.value;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      message: `Error: Provide at least one SEO field to update (${SEO_PATCH_KEYS.join(", ")}).`,
    };
  }

  return { ok: true, patch };
};

export const mergeSeoUpdate = (
  current: Record<string, unknown>,
  patch: SeoPatch,
): { seo: Record<string, unknown>; changedKeys: string[] } => {
  const seo: Record<string, unknown> = { ...current };
  const changedKeys: string[] = [];

  for (const key of SEO_PATCH_KEYS) {
    if (!(key in patch)) continue;
    changedKeys.push(key);

    if (key === "jsonLD") {
      seo.jsonLD =
        patch.jsonLD === null || patch.jsonLD === undefined ? EMPTY_JSON_OBJECT : JSON.stringify(patch.jsonLD);
      continue;
    }
    if (key === "metaOther") {
      const pairs = patch.metaOther ?? {};
      seo.metaOther = Object.keys(pairs).length === 0 ? EMPTY_JSON_OBJECT : JSON.stringify(pairs);
      continue;
    }
    if (key === "canonicalUrl") {
      seo.canonicalUrl = patch.canonicalUrl;
      delete seo.cononicalUrl;
      continue;
    }
    seo[key] = patch[key];
  }

  if (
    patch.ogImage !== undefined &&
    patch.ogImage !== asString(current.ogImage) &&
    asString(current.ogImageId) !== ""
  ) {
    seo.ogImageId = "";
    changedKeys.push("ogImageId");
  }

  return { seo, changedKeys };
};

export const describeSeoPageLang = (info: PageLangInfo): string => {
  if (!info.lang) return "";
  const base = `Content language: ${langLabel(info.lang)}. Write all SEO text in this language.`;
  if (!info.isLanguageVariant) return base;
  return `${base} SEO is stored per language page: changes here apply only to the ${langLabel(info.lang)} row, and the primary-language page and other variants keep their own SEO. When this variant has no JSON-LD of its own it inherits the primary page's document at render time.`;
};
