export type PageRoutingMetadata = {
  id: string;
  name: string;
  slug: string;
  lang: string;
  primaryPage: string | null;
  pageType: string | null;
  dynamic: boolean | null;
  dynamicSlugCustom: string | null;
  parent: string | null;
  /** The page this one renders while `useUpstream` is on. Absent on cache entries predating the columns. */
  upstream?: string | null;
  useUpstream?: boolean | null;
};

export type RoutingSlugUpdate = {
  id: string;
  oldSlug?: string;
  newSlug?: string;
};

export function encodeSlug(slug: string): string {
  return Buffer.from(slug, "utf8").toString("base64url");
}

export function decodeSlug(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}

export function slugTag(slug: string): string {
  return `slug-${encodeSlug(slug)}`;
}

/**
 * Tag for the id -> online slug mapping used by link resolution
 * (resolvePageSlug / resolvePageSlugs). Invalidate ONLY when a page's
 * ONLINE slug changes: publish with a different/first slug, take-offline,
 * delete. Draft mutations must NOT emit it — draft mode uses the memory
 * cache where tags are ignored, and emitting it from draft-side mutations
 * would rebuild every page linking to this one on each draft slug edit.
 * Uses ":" so it can never match the `page-<id>` warmup regex or collide
 * with the `page-slug-` persistent cache key prefix.
 */
export function pageSlugTag(pageId: string): string {
  return `page-slug:${pageId}`;
}

export function pageSlugTagsForPageIds(pageIds: string[]): string[] {
  return [...new Set(pageIds)].map(pageSlugTag);
}

function draftOrOnline(draftMode: boolean): "draft" | "online" {
  return draftMode ? "draft" : "online";
}

export function pageBySlugCacheKey(appId: string, draftMode: boolean, slug: string): string[] {
  return [`page-by-slug-${appId}-${draftOrOnline(draftMode)}-${encodeSlug(slug)}`];
}

// `langKey` is "" for the default language, keeping the key byte-identical to
// the pre-i18n form so warm default-language entries are reused; a non-default
// language gets its own entry (a uuid pageId can never collide with an
// "<lang>-" prefix).
export function pageSlugCacheKey(appId: string, draftMode: boolean, pageId: string, langKey = ""): string[] {
  const langPart = langKey ? `${langKey}-` : "";
  return [`page-slug-${appId}-${draftOrOnline(draftMode)}-${langPart}${pageId}`];
}

export function pageSlugsBatchCacheKey(
  appId: string,
  draftMode: boolean,
  pageIds: string[],
  langKey = "",
): string[] {
  const sortedIds = [...pageIds].sort().join(",");
  const langPart = langKey ? `${langKey}-` : "";
  return [`page-slugs-batch-${appId}-${draftOrOnline(draftMode)}-${langPart}${sortedIds}`];
}

export function alternatePagesCacheKey(appId: string, draftMode: boolean, primaryPageId: string): string[] {
  // The cached value is the raw language group (every page sharing this primary), which
  // depends only on app + draft + primaryPageId. The per-request exclude-self and
  // hreflang labeling are applied outside the cache, so no lang/page component is needed.
  return [`alternate-${appId}-${draftOrOnline(draftMode)}-${primaryPageId}`];
}

export function breadcrumbCacheKey(appId: string, draftMode: boolean, pageId: string): string[] {
  return [`breadcrumb-${appId}-${draftOrOnline(draftMode)}-${pageId}`];
}

/** Carried by every cache of a linked page; the host revalidates it when the upstream page changes. */
export function upstreamPageTag(upstreamId: string): string {
  return `upstream-page-${upstreamId}`;
}

/**
 * Carried by every cache of a linked page in site `appId`: its content holds that site's partials and
 * links matched to that site's pages, so publishing, unpublishing or deleting them revalidates it.
 */
export function upstreamSiteTag(appId: string): string {
  return `upstream-site-${appId}`;
}

export function routingTagsForSlug(slug: string): string[] {
  return [slugTag(slug)];
}

export function routingTagsForPage(pageId: string, slug: string): string[] {
  return [`page-${pageId}`, slugTag(slug), `breadcrumb-${pageId}`];
}

// Deliberately does NOT emit pageSlugTag: all callers are draft-side
// mutations (update/create/duplicate/restore). Emitting it here would
// reintroduce the linking-page fan-out on every draft slug edit — the
// online slug only changes at publish, which handles pageSlugTag itself.
export function routingTagsForMutation(
  pageId: string,
  options?: {
    slugs?: { old?: string; new?: string };
    primaryPageId?: string | null;
    slugUpdates?: RoutingSlugUpdate[];
    extraPageIds?: string[];
  },
): string[] {
  const tags = new Set<string>([`page-${pageId}`, `breadcrumb-${pageId}`]);

  if (options?.slugs?.old) tags.add(slugTag(options.slugs.old));
  if (options?.slugs?.new) tags.add(slugTag(options.slugs.new));
  if (options?.primaryPageId) tags.add(`alternate-${options.primaryPageId}`);

  for (const id of options?.extraPageIds ?? []) {
    tags.add(`page-${id}`);
    tags.add(`breadcrumb-${id}`);
  }

  for (const update of options?.slugUpdates ?? []) {
    tags.add(`page-${update.id}`);
    tags.add(`breadcrumb-${update.id}`);
    if (update.oldSlug) tags.add(slugTag(update.oldSlug));
    if (update.newSlug) tags.add(slugTag(update.newSlug));
  }

  return [...tags];
}

// Delete-scoped: deletion always removes the online row, so the id -> slug
// mapping cached by link resolution must drop too (pageSlugTag). A deleted
// language variant must ALSO bust its primary's pageSlugTag: language-aware
// link resolution caches the variant's slug under the PRIMARY id (that is the
// id a `pageType:page:<primaryId>` href carries), so tagging only the variant
// id would leave that entry serving the deleted route forever (no TTL). This
// matches take-offline/publish, which already emit both ids.
export function routingTagsForPages(
  pages: Array<{ id: string; slug?: string | null; primaryPage?: string | null }>,
): string[] {
  const tags = new Set<string>();

  for (const page of pages) {
    tags.add(`page-${page.id}`);
    tags.add(`breadcrumb-${page.id}`);
    tags.add(pageSlugTag(page.id));
    if (page.slug) tags.add(slugTag(page.slug));
    if (page.primaryPage) {
      tags.add(`alternate-${page.primaryPage}`);
      tags.add(pageSlugTag(page.primaryPage));
    }
  }

  return [...tags];
}

export function routingTagsForPageIds(pageIds: string[]): string[] {
  const tags = new Set<string>();
  for (const id of pageIds) {
    tags.add(`page-${id}`);
    tags.add(`breadcrumb-${id}`);
  }
  return [...tags];
}
