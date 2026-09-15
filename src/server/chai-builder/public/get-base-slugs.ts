import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import type { ChaiBaseSlugEntry } from "~/types/chaibuilder-config";
import { getFallbackLang } from "../internal/init";
import { getInitializedState } from "../state";
import { withRequestCache } from "./cache-utils";
import { inheritDynamicFlagsFromPrimary } from "./find-page-by-slug";

export type GetBaseSlugsOptions = {
  /** When set, return only templates for this language (e.g. Payload locale). */
  lang?: string;
  /** When true, read draft `app_pages`; default false = published `app_pages_online`. */
  draft?: boolean;
};

type BaseSlugRow = {
  id: string;
  slug: string | null;
  lang: string | null;
  primaryPage: string | null;
  dynamic: boolean | null;
  dynamicSlugCustom: string | null;
};

/**
 * Picks template rows for `lang` that are effectively dynamic.
 * Alternate-language rows historically never copied `dynamic`/`dynamicSlugCustom`
 * from their fallback-language primary at creation time, so hydrate those flags
 * from any dynamic primaries present in `rows` before filtering (see `inheritDynamicFlagsFromPrimary`).
 */
export function pickDynamicBaseSlugsForLang<T extends BaseSlugRow>(rows: T[], lang: string): T[] {
  return inheritDynamicFlagsFromPrimary(rows).filter((row) => row.lang === lang && row.dynamic);
}

async function fetchBaseSlugs(
  appId: string,
  pageType: string,
  options: GetBaseSlugsOptions,
  fallbackLang: string,
): Promise<ChaiBaseSlugEntry[]> {
  const table = options.draft ? schema.appPages : schema.appPagesOnline;
  const baseConditions = [eq(table.app, appId), eq(table.pageType, pageType), isNotNull(table.slug), ne(table.slug, "")];

  // Dynamic primary templates always live on the fallback-language rows (lang = '').
  const { data: primaries, error } = await safeQuery(() =>
    db
      .select({
        id: table.id,
        slug: table.slug,
        lang: table.lang,
        primaryPage: table.primaryPage,
        dynamic: table.dynamic,
        dynamicSlugCustom: table.dynamicSlugCustom,
      })
      .from(table)
      .where(and(...baseConditions, eq(table.dynamic, true), eq(table.lang, ""))),
  );
  if (error) throw error;

  const toEntry = (row: BaseSlugRow): ChaiBaseSlugEntry => ({
    slug: row.slug!,
    lang: row.lang || fallbackLang,
    pageId: row.id,
    primaryPageId: row.primaryPage,
    dynamicSlugCustom: row.dynamicSlugCustom,
  });

  const wantedLang = options.lang && options.lang !== fallbackLang ? options.lang : null;
  if (!wantedLang) return (primaries ?? []).map(toEntry);

  // Alt-language rows historically never copied `dynamic` from their primary,
  // so membership is by `primaryPage` pointing at a dynamic primary (own
  // `dynamic=true` rows are kept too for rows that were copied correctly).
  const primaryIds = (primaries ?? []).map((row) => row.id);
  const langCondition =
    primaryIds.length > 0
      ? or(eq(table.dynamic, true), inArray(table.primaryPage, primaryIds))
      : eq(table.dynamic, true);

  const { data: altRows, error: altError } = await safeQuery(() =>
    db
      .select({
        id: table.id,
        slug: table.slug,
        lang: table.lang,
        primaryPage: table.primaryPage,
        dynamic: table.dynamic,
        dynamicSlugCustom: table.dynamicSlugCustom,
      })
      .from(table)
      .where(and(...baseConditions, eq(table.lang, wantedLang), langCondition)),
  );
  if (altError) throw altError;

  return pickDynamicBaseSlugsForLang([...(primaries ?? []), ...(altRows ?? [])], wantedLang).map(toEntry);
}

export async function getBaseSlugs(pageType: string, options: GetBaseSlugsOptions = {}): Promise<ChaiBaseSlugEntry[]> {
  const state = getInitializedState();
  const draft = options.draft ?? state.draftMode ?? false;

  return await withRequestCache(fetchBaseSlugs, "fetchBaseSlugs")(
    state.appId!,
    pageType,
    { ...options, draft },
    await getFallbackLang(),
  );
}
