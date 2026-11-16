import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getFallbackLang } from "../internal/init";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { pageSlugCacheKey, pageSlugsBatchCacheKey, pageSlugTag, pageSlugTagsForPageIds } from "./page-routing-cache";
import {
  untranslatedLinkFallback,
  untranslatedSlug,
  type UntranslatedLinkFallback,
} from "./untranslated-link-fallback";

/**
 * Links store a reference to the DEFAULT-language (primary) page id
 * (`pageType:page:<primaryId>`). Resolving that id straight to `slug` returns
 * the primary page's slug — correct for the default language, wrong for every
 * other one: an `/en` menu would then point at the French `/a-propos`. So for a
 * non-default `langKey` we prefer the translated row (`primaryPage = <id> AND
 * lang = <langKey>`); what a page with no translation resolves to is the
 * `CHAI_UNTRANSLATED_LINK_FALLBACK` choice (see `untranslatedLinkFallback`),
 * the primary slug by default (better a working default-language link than a
 * dead one).
 *
 * `langKey` is "" for the default language (see `normalizeLangKey`), which keeps
 * the query — and the cache key — identical to the pre-i18n behaviour.
 */
const normalizeLangKey = (lang: string | undefined, fallbackLang: string): string =>
  !lang || lang === fallbackLang ? "" : lang;

/** Keeps default-mode cache keys unchanged; other modes get their own entries. */
const cacheLangKey = (langKey: string, mode: UntranslatedLinkFallback): string =>
  langKey && mode !== "primary" ? `${langKey}+${mode}` : langKey;

async function fetchPageSlugQuery(
  appId: string,
  draftMode: boolean,
  pageId: string,
  langKey: string,
  mode: UntranslatedLinkFallback = "primary",
): Promise<string> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;

  if (!langKey) {
    const { data, error } = await safeQuery(() =>
      db
        .select({ slug: table.slug })
        .from(table)
        .where(and(eq(table.app, appId), isNull(table.deletedAt), eq(table.id, pageId)))
        .limit(1),
    );

    // A failed query is not a missing page: resolvePageSlug turns PAGE_NOT_FOUND into "#".
    if (error) throw new Error("FAILED_TO_RESOLVE_PAGE_SLUG", { cause: error });

    if (!data?.[0]?.slug) {
      throw new Error("PAGE_NOT_FOUND");
    }

    return data[0].slug;
  }

  const { data, error } = await safeQuery(() =>
    db
      .select({ id: table.id, slug: table.slug, lang: table.lang, primaryPage: table.primaryPage })
      .from(table)
      .where(
        and(
          eq(table.app, appId),
          isNull(table.deletedAt),
          or(eq(table.id, pageId), and(eq(table.primaryPage, pageId), eq(table.lang, langKey))),
        ),
      ),
  );

  if (error) throw new Error("FAILED_TO_RESOLVE_PAGE_SLUG", { cause: error });

  if (!data?.length) {
    throw new Error("PAGE_NOT_FOUND");
  }

  const translated = data.find((row) => row.primaryPage === pageId && row.lang === langKey && row.slug);
  if (translated?.slug) {
    return translated.slug;
  }

  const primary = data.find((row) => row.id === pageId && row.slug);
  const fallback = untranslatedSlug(mode, langKey, primary?.slug);
  if (fallback) {
    return fallback;
  }

  throw new Error("PAGE_NOT_FOUND");
}

async function fetchPageSlugsBatchQuery(
  appId: string,
  draftMode: boolean,
  pageIds: string[],
  langKey: string,
  mode: UntranslatedLinkFallback = "primary",
): Promise<Record<string, string>> {
  if (pageIds.length === 0) {
    return {};
  }

  const table = draftMode ? schema.appPages : schema.appPagesOnline;

  if (!langKey) {
    const { data, error } = await safeQuery(() =>
      db
        .select({ id: table.id, slug: table.slug })
        .from(table)
        .where(and(eq(table.app, appId), isNull(table.deletedAt), inArray(table.id, pageIds))),
    );

    // {} would render every link as "#" and be persisted with no expiry; a throw is never persisted.
    if (error) throw new Error("FAILED_TO_RESOLVE_PAGE_SLUGS", { cause: error });

    if (!data) {
      return {};
    }

    const slugs: Record<string, string> = {};
    for (const row of data) {
      if (row.slug) {
        slugs[row.id] = row.slug;
      }
    }
    return slugs;
  }

  const { data, error } = await safeQuery(() =>
    db
      .select({ id: table.id, slug: table.slug, lang: table.lang, primaryPage: table.primaryPage })
      .from(table)
      .where(
        and(
          eq(table.app, appId),
          isNull(table.deletedAt),
          or(inArray(table.id, pageIds), and(inArray(table.primaryPage, pageIds), eq(table.lang, langKey))),
        ),
      ),
  );

  if (error) throw new Error("FAILED_TO_RESOLVE_PAGE_SLUGS", { cause: error });

  if (!data) {
    return {};
  }

  const idSet = new Set(pageIds);
  // Keyed by the referenced (primary) id in every case, since that is the id
  // the link href carries: primaries by their own id, translations by the
  // primary they point at.
  const primaryById = new Map<string, string>();
  const translatedByPrimary = new Map<string, string>();
  for (const row of data) {
    if (!row.slug) continue;
    // Populated independently: a row can be both a referenced primary (its id is
    // linked) and a translation of another referenced id, and each map needs it.
    if (idSet.has(row.id)) {
      primaryById.set(row.id, row.slug);
    }
    if (row.primaryPage && row.lang === langKey && idSet.has(row.primaryPage)) {
      translatedByPrimary.set(row.primaryPage, row.slug);
    }
  }

  const slugs: Record<string, string> = {};
  for (const id of pageIds) {
    const slug = translatedByPrimary.get(id) ?? untranslatedSlug(mode, langKey, primaryById.get(id));
    if (slug) {
      slugs[id] = slug;
    }
  }
  return slugs;
}

export async function resolvePageSlug(pageId: string, lang?: string): Promise<string | null> {
  const state = getInitializedState();
  const langKey = normalizeLangKey(lang, await getFallbackLang());
  const mode = untranslatedLinkFallback();

  try {
    return await withChaiCache(
      fetchPageSlugQuery,
      pageSlugCacheKey(state.appId!, state.draftMode, pageId, cacheLangKey(langKey, mode)),
      // Tagged under the primary id: publishing any language variant of this
      // page emits pageSlugTag(<primaryId>) (see publishPage), so a translated
      // slug change invalidates this entry too.
      [pageSlugTag(pageId)],
      false,
      "resolvePageSlug",
    )(state.appId!, state.draftMode, pageId, langKey, mode);
  } catch (error) {
    // A deleted or unpublished link target still renders as "#". Anything else is a
    // failed lookup and must fail the render, not ship a page of dead links.
    if (error instanceof Error && error.message === "PAGE_NOT_FOUND") return null;
    throw error;
  }
}

export async function resolvePageSlugs(pageIds: string[], lang?: string): Promise<Map<string, string>> {
  const state = getInitializedState();
  const langKey = normalizeLangKey(lang, await getFallbackLang());
  const uniqueIds = [...new Set(pageIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  if (uniqueIds.length === 1) {
    const slug = await resolvePageSlug(uniqueIds[0]!, lang);
    return slug ? new Map([[uniqueIds[0]!, slug]]) : new Map();
  }

  const mode = untranslatedLinkFallback();
  const slugRecord = await withChaiCache(
    fetchPageSlugsBatchQuery,
    pageSlugsBatchCacheKey(state.appId!, state.draftMode, uniqueIds, cacheLangKey(langKey, mode)),
    pageSlugTagsForPageIds(uniqueIds),
    false,
    "resolvePageSlugs",
  )(state.appId!, state.draftMode, uniqueIds, langKey, mode);

  return new Map(Object.entries(slugRecord));
}
