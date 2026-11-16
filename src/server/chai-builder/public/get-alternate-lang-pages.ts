import { and, eq, or } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { alternatePagesCacheKey, type PageRoutingMetadata } from "./page-routing-cache";

export type AlternateLangPage = Pick<PageRoutingMetadata, "id" | "name" | "slug" | "lang" | "dynamic"> & {
  primaryLang: boolean;
};

type AlternateLangGroupRow = Pick<PageRoutingMetadata, "id" | "name" | "slug" | "lang" | "dynamic" | "primaryPage">;

// Fetch the raw language group for a primary page: every page whose `primaryPage`
// points at it, plus the primary itself. This is the only part that hits the DB and
// the only part worth caching — its result depends solely on (app, draftMode,
// primaryPageId). The exclude-self and hreflang-label steps are per-request and run
// outside the cache (see getAlternateLangPages), so they never poison a shared entry.
async function fetchAlternateLangGroup(
  appId: string,
  draftMode: boolean,
  primaryPageId: string,
): Promise<AlternateLangGroupRow[]> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;
  const { data, error } = await safeQuery(() =>
    db
      .select({
        id: table.id,
        name: table.name,
        slug: table.slug,
        lang: table.lang,
        dynamic: table.dynamic,
        primaryPage: table.primaryPage,
      })
      .from(table)
      .where(and(eq(table.app, appId), or(eq(table.primaryPage, primaryPageId), eq(table.id, primaryPageId)))),
  );

  // [] would drop every hreflang alternate and be persisted with no expiry; a throw is never persisted.
  if (error) throw new Error("FAILED_TO_FETCH_ALTERNATE_PAGES", { cause: error });

  return (data ?? []) as AlternateLangGroupRow[];
}

export async function getAlternateLangPages(
  primaryPageId: string,
  requestedPageId: string,
  fallbackLang: string,
): Promise<AlternateLangPage[]> {
  const state = getInitializedState();

  const group = await withChaiCache(
    fetchAlternateLangGroup,
    alternatePagesCacheKey(state.appId!, state.draftMode, primaryPageId),
    [`alternate-${primaryPageId}`, `page-${primaryPageId}`],
    false,
    "getAlternateLangPages",
  )(state.appId!, state.draftMode, primaryPageId);

  return (
    group
      // Exclude ONLY the requesting page (by id), not every sibling sharing its
      // effective language. Staging keys "self" on page id; a language-based filter
      // drops a legit alternate whose lang column coalesces to the requester's lang
      // (common for dynamic alt-lang templates), which left cross-language hreflang
      // alternates missing on the subtree. Applied here, outside the cache, so the
      // cached group is independent of which page requested it.
      .filter((p) => p.id !== requestedPageId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        // The primary page stores an empty `lang`, so its hreflang label is the
        // site fallback, passed in by the caller (resolved from site settings).
        // Mislabeling the French primary as `en` would overwrite the real `en`
        // variant's self-hreflang with the French URL.
        lang: p.lang || fallbackLang,
        dynamic: p.dynamic ?? false,
        primaryLang: p.id === primaryPageId,
      }))
  );
}
