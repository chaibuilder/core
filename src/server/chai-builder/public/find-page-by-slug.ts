import { escapeRegExp, get, isEmpty, keys, reverse, sortBy, take } from "lodash-es";
import type { PageRoutingMetadata } from "./page-routing-cache";

/**
 * Paginated slugs (e.g. `/blog/2`) resolve to their base page (`/blog`).
 * Returns the base slug when the last segment is numeric, null otherwise
 * (including root-level numeric slugs like `/4`, which have no base page).
 *
 * The page number is capped at 3 digits so numeric content ids — listing
 * detail URLs like `/listing/2434343` — are treated as slugs, not pagination.
 */
const PAGINATION_SEGMENT_REGEX = /\/\d{1,3}$/;

export function getPaginationBaseSlug(slug: string): string | null {
  if (!PAGINATION_SEGMENT_REGEX.test(slug)) return null;
  return slug.replace(PAGINATION_SEGMENT_REGEX, "") || null;
}

/**
 * Alternate-language rows historically didn't copy `dynamic`/`dynamicSlugCustom`
 * from their primary page at creation time, so e.g. the EN row of a dynamic FR
 * inventory template can be stored with `dynamic=false`. Hydrate those flags at
 * read time from dynamic primaries present in the same candidate set, instead
 * of requiring a data backfill. Mirrors `inheritDynamicFlagsFromPrimary` in
 * staging's `db/supabase/ChaiBuilderPages.ts`.
 */
export function inheritDynamicFlagsFromPrimary<
  T extends {
    id: string;
    primaryPage: string | null;
    dynamic: boolean | null;
    dynamicSlugCustom: string | null;
  },
>(pages: T[]): T[] {
  const primariesById = new Map(pages.filter((p) => !p.primaryPage).map((p) => [p.id, p]));

  return pages.map((page) => {
    if (!page.primaryPage || (page.dynamic && !isEmpty(page.dynamicSlugCustom))) return page;

    const primary = primariesById.get(page.primaryPage);
    if (!primary?.dynamic) return page;

    return {
      ...page,
      dynamic: true,
      dynamicSlugCustom: isEmpty(page.dynamicSlugCustom) ? primary.dynamicSlugCustom : page.dynamicSlugCustom,
    };
  });
}

/**
 * Every dynamic template whose pattern matches `slug`, in the SDK's default
 * priority order: page-type registration order first, deepest base slug first
 * as the tie-breaker among equal page types (a stable re-sort of the depth
 * ordering by registration index). `[0]` is exactly what `findPageBySlug`
 * resolves to; the full list lets a caller arbitrate between templates that
 * share a base slug (see `resolveConfigDynamicTemplateTie`). Empty when nothing
 * matches.
 */
export function findMatchingDynamicPages(
  slug: string,
  pages: PageRoutingMetadata[],
  dynamicSegments: Record<string, string>,
): PageRoutingMetadata[] {
  const strippedSlug = slug.slice(1);
  const segment1 = `/${take(strippedSlug.split("/"), 1).join("/")}`;
  const segment2 = `/${take(strippedSlug.split("/"), 2).join("/")}`;

  const dynamicPages = pages.filter((p) => p.dynamic && (p.slug.includes(segment1) || p.slug.includes(segment2)));

  if (dynamicPages.length === 0) return [];

  const sortedPages = reverse(sortBy(dynamicPages, (page) => page.slug.split("/").length));

  const dynamicKeys = keys(dynamicSegments);
  if (dynamicKeys.length > 0) {
    sortedPages.sort((a, b) => {
      const aIndex = dynamicKeys.indexOf(a.pageType || "");
      const bIndex = dynamicKeys.indexOf(b.pageType || "");
      const aOrder = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const bOrder = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return aOrder - bOrder;
    });
  }

  const matches: PageRoutingMetadata[] = [];
  for (const page of sortedPages) {
    if (isEmpty(page.slug)) continue;

    const pageType = page.pageType || "";
    const regex = get(dynamicSegments, pageType, "");
    const customSlug = page.dynamicSlugCustom || "";

    // The slug is literal text; only the segment pattern and custom suffix are regex. A pattern
    // that still fails to compile skips this template instead of failing every URL under it.
    let reg: RegExp;
    try {
      reg = new RegExp(escapeRegExp(page.slug) + regex + customSlug);
    } catch {
      continue;
    }
    const match = slug.match(reg);

    if (match && match[0] === slug) {
      matches.push(page);
    }
  }

  return matches;
}

export function findPageBySlug(
  slug: string,
  pages: PageRoutingMetadata[],
  dynamicSegments: Record<string, string>,
): PageRoutingMetadata {
  const staticPage = pages.find((p) => p.slug === slug && !p.dynamic);
  if (staticPage) return staticPage;

  const matches = findMatchingDynamicPages(slug, pages, dynamicSegments);
  if (matches.length === 0) {
    throw new Error("PAGE_NOT_FOUND");
  }

  return matches[0];
}
