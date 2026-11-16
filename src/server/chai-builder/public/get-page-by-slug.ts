import { and, eq, inArray, isNull, ne, notInArray, or, type SQL } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { type PageRoutingMetadata, pageBySlugCacheKey, routingTagsForSlug } from "./page-routing-cache";
import { resolveConfigDynamicTemplateTie } from "~/server/defaults/config-registry";
import {
  findMatchingDynamicPages,
  getDynamicSegmentsConfig,
  getPaginationBaseSlug,
  inheritDynamicFlagsFromPrimary,
} from "./page-routing-utils";

type AppPagesTable = typeof schema.appPages | typeof schema.appPagesOnline;

/**
 * Ids of dynamic primary pages for the app. Alt-language rows referencing one
 * of these must resolve through dynamic matching even when their own `dynamic`
 * flag was never copied from the primary (see `inheritDynamicFlagsFromPrimary`).
 */
function dynamicPrimaryPageIds(table: AppPagesTable, appId: string) {
  return db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.app, appId), eq(table.dynamic, true), isNull(table.primaryPage)));
}

/**
 * The one query both routing lookups run, and the one place a failure is handled.
 * A failed query is not "no page at this slug": returning [] would fall through to
 * dynamic matching (resolving the URL to the wrong template) or to PAGE_NOT_FOUND
 * (a 404 the route cache keeps), and the routing entry is persisted with no expiry.
 * A throw is never persisted.
 */
async function selectRoutingPages(table: AppPagesTable, where: SQL | undefined): Promise<PageRoutingMetadata[]> {
  const { data, error } = await safeQuery(() =>
    db
      .select({
        id: table.id,
        name: table.name,
        slug: table.slug,
        lang: table.lang,
        primaryPage: table.primaryPage,
        pageType: table.pageType,
        dynamic: table.dynamic,
        dynamicSlugCustom: table.dynamicSlugCustom,
        parent: table.parent,
        upstream: table.upstream,
        useUpstream: table.useUpstream,
      })
      .from(table)
      .where(where),
  );

  if (error) throw new Error("FAILED_TO_RESOLVE_PAGE", { cause: error });

  return data ?? [];
}

async function fetchStaticPagesBySlugs(
  appId: string,
  draftMode: boolean,
  slugs: string[],
): Promise<PageRoutingMetadata[]> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;
  return selectRoutingPages(
    table,
    and(
      eq(table.app, appId),
      inArray(table.slug, slugs),
      isNull(table.deletedAt),
      // Folders only claim a URL segment for their children — visiting a
      // folder's own slug is a 404, so they never resolve.
      or(isNull(table.pageType), ne(table.pageType, "_folder")),
      or(eq(table.dynamic, false), isNull(table.dynamic)),
      or(isNull(table.primaryPage), notInArray(table.primaryPage, dynamicPrimaryPageIds(table, appId))),
    ),
  );
}

async function fetchDynamicPageCandidates(appId: string, draftMode: boolean): Promise<PageRoutingMetadata[]> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;
  const candidates = await selectRoutingPages(
    table,
    and(
      eq(table.app, appId),
      or(eq(table.dynamic, true), inArray(table.primaryPage, dynamicPrimaryPageIds(table, appId))),
      isNull(table.deletedAt),
      // Same rule as the static path: a folder never answers its own URL.
      // Without this, a folder row carrying `dynamic` resolves here instead
      // and renders the page the static exclusion exists to prevent.
      or(isNull(table.pageType), ne(table.pageType, "_folder")),
    ),
  );

  return inheritDynamicFlagsFromPrimary(candidates);
}

/**
 * Pick the row that should own an exact slug when several match it. Prefer a
 * real `page` over any other type: a partial (e.g. a `global`/header row that
 * was mis-saved with a routable slug instead of the usual empty one) can share
 * a slug with the real page, and the DB returns them in arbitrary order — an
 * unbiased `.find()` can then resolve the URL to the content-less partial and
 * render an empty page (observed on a site whose `en` home collided with a
 * `global` at `/en`). Staging applied the same pageType='page'-first tiebreak.
 */
function pickRoutablePage(pages: PageRoutingMetadata[], slug: string | null): PageRoutingMetadata | undefined {
  if (!slug) return undefined;
  const matches = pages.filter((p) => p.slug === slug);
  if (matches.length === 0) return undefined;
  return matches.find((p) => p.pageType === "page") ?? matches[0];
}

/**
 * The purely DB-derived half of slug resolution: the resolved static page, or —
 * when several dynamic templates match one URL — every competing candidate in
 * default priority order. This is what `resolvePageBySlug` persists, so it must
 * stay a pure function of the routing tables (slug-tagged): the data-dependent
 * choice between competing templates is made OUTSIDE this cache, by the
 * tie-break, whose own inputs carry their own cache tags. Folding that choice in
 * here would (a) nest one tagged cache inside another and (b) bake a decision
 * that depends on `firebase-seo-used-cars` into a slug-only-tagged entry, so a
 * later publish/unpublish/delete — or a transient lookup failure on first fill —
 * could never correct it.
 */
export async function resolvePageBySlugQuery(
  appId: string,
  draftMode: boolean,
  slug: string,
): Promise<PageRoutingMetadata | PageRoutingMetadata[]> {
  // Paginated slugs (e.g. /blog/2) fall back to their non-dynamic base page
  // (/blog) before dynamic matching; both candidates are fetched in a single
  // round-trip and the exact slug match wins over the pagination base. The
  // page number is derived downstream by comparing the requested slug against
  // page.slug, and whether a trailing number is pagination or content (e.g. a
  // numeric vehicle model) is also disambiguated downstream from the resolved
  // page's data.
  const paginationBaseSlug = getPaginationBaseSlug(slug);
  const candidateSlugs = paginationBaseSlug ? [slug, paginationBaseSlug] : [slug];
  const staticPages = await fetchStaticPagesBySlugs(appId, draftMode, candidateSlugs);
  const staticPage = pickRoutablePage(staticPages, slug) ?? pickRoutablePage(staticPages, paginationBaseSlug);
  if (staticPage) return staticPage;

  const dynamicPages = await fetchDynamicPageCandidates(appId, draftMode);
  const dynamicSegments = getDynamicSegmentsConfig();

  // Return every regex match. A single match resolves directly; multiple matches
  // (e.g. `vdp_page` and a legacy SEO listing both on `/auto-usage`, where a
  // hyphen-rich URL matches both patterns) are handed to the tie-break by the
  // caller, outside this cache.
  const matches = findMatchingDynamicPages(slug, dynamicPages, dynamicSegments);
  if (matches.length === 0) throw new Error("PAGE_NOT_FOUND");
  return matches;
}

export async function resolvePageBySlug(slug: string): Promise<PageRoutingMetadata> {
  const state = getInitializedState();

  // Tag paginated entries with their base slug too, so publishing/renaming
  // the base page also invalidates the cached routing of its paginated URLs.
  const paginationBaseSlug = getPaginationBaseSlug(slug);
  const tags = paginationBaseSlug
    ? [...routingTagsForSlug(slug), ...routingTagsForSlug(paginationBaseSlug)]
    : routingTagsForSlug(slug);

  const resolved = await withChaiCache(
    resolvePageBySlugQuery,
    pageBySlugCacheKey(state.appId!, state.draftMode, slug),
    tags,
    false,
    "resolvePageBySlug",
  )(state.appId!, state.draftMode, slug);

  // A single resolved page (static, or the only matching dynamic template) needs
  // no arbitration. Multiple competing templates are resolved here — OUTSIDE the
  // routing cache — so the tie-break's data dependency is never persisted into
  // this slug-tagged entry (see resolvePageBySlugQuery). The default (no host
  // handler) is the first candidate, matching registration-order resolution.
  if (!Array.isArray(resolved)) return resolved;
  if (resolved.length === 1) return resolved[0];
  return (await resolveConfigDynamicTemplateTie(resolved, slug)) ?? resolved[0];
}
