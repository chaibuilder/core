import { consola } from "consola";
import { and, eq } from "drizzle-orm";
import { get, isEmpty, uniq } from "lodash-es";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { runInContext } from "~/server/chai-builder/state";
import type { ChaiDesignTokens } from "~/types";
import { applyChaiDesignTokens } from "~/utils";
import { getFullPage } from "./get-full-page";
import { getPageStylesCached } from "./get-page-styles";
import { getSiteSettings } from "./get-site-settings";

const WARMUP_CONCURRENCY = 3;
const PAGE_ID_TAG = /^page-([a-zA-Z0-9_-]+)$/;
// "slugs": the host's page-list tag `page-slugs`, not a page id.
const NON_PAGE_ID_SUFFIXES = new Set(["styles", "slugs"]);
const warmupLogger = consola.withTag("ChaiPublishWarmup");

export type WarmPublishedPagesResult = {
  routesWarmed: number;
  routesSkipped: number;
  routesFailed: number;
  stylesWarmed: number;
  stylesSkipped: number;
  stylesFailed: number;
  totalMs: number;
};

export function extractPageIdsFromTags(tags: string[]): string[] {
  const pageIds = new Set<string>();

  for (const tag of tags) {
    // Slug-mapping tags (page-slug:*) are not page ids. Keep the colon
    // separator: a dash form would be ambiguous with page ids like "slug-x".
    if (tag.startsWith("page-slug:")) continue;

    const match = tag.match(PAGE_ID_TAG);
    if (!match) continue;

    const pageId = match[1];
    if (NON_PAGE_ID_SUFFIXES.has(pageId)) continue;

    pageIds.add(pageId);
  }

  return Array.from(pageIds);
}

function buildPublicUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function getOnlinePageBySlug(appId: string, slug: string) {
  const { data } = await safeQuery(() =>
    db.query.appPagesOnline.findFirst({
      where: and(eq(schema.appPagesOnline.app, appId), eq(schema.appPagesOnline.slug, slug)),
      columns: {
        id: true,
        primaryPage: true,
        dynamic: true,
        slug: true,
      },
    }),
  );

  return data ?? null;
}

async function prefetchStaticRoute(siteUrl: string, path: string): Promise<void> {
  const response = await fetch(buildPublicUrl(siteUrl, path), {
    headers: {
      "User-Agent": "ChaiBuilder-Publish-Warmup",
    },
  });

  if (!response.ok) {
    throw new Error(`Route prefetch failed with status ${response.status} for ${path}`);
  }
}

async function warmPageStylesForPageId(pageId: string): Promise<boolean> {
  const page = await getFullPage(pageId, { mergePartials: true });

  if (isEmpty(page.slug)) {
    return false;
  }

  const siteSettings = await getSiteSettings();
  const designTokens = {
    ...CHAI_BUILT_IN_DESIGN_TOKENS,
    ...(get(siteSettings, "designTokens", {}) as ChaiDesignTokens),
  };
  const pageBlocks = applyChaiDesignTokens(page.blocks ?? [], designTokens);

  await getPageStylesCached(pageId, pageBlocks);
  return true;
}

function markRoutePrefetchedPageIds(
  routePrefetchedPageIds: Set<string>,
  page: { id: string; primaryPage: string | null },
): void {
  routePrefetchedPageIds.add(page.id);
  if (page.primaryPage) {
    routePrefetchedPageIds.add(page.primaryPage);
  }
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(fn));
  }
}

export async function warmPublishedPagesCache(options: {
  appId: string;
  tags: string[];
  paths: string[];
  siteUrl: string | null;
}): Promise<WarmPublishedPagesResult> {
  const { appId, tags, paths, siteUrl } = options;
  const pageIds = extractPageIdsFromTags(tags);
  const uniquePaths = uniq(paths.filter(Boolean));
  const routePrefetchedPageIds = new Set<string>();
  const result: WarmPublishedPagesResult = {
    routesWarmed: 0,
    routesSkipped: 0,
    routesFailed: 0,
    stylesWarmed: 0,
    stylesSkipped: 0,
    stylesFailed: 0,
    totalMs: 0,
  };

  if (pageIds.length === 0 && uniquePaths.length === 0) {
    return result;
  }

  const start = performance.now();

  await runInContext({ appId, draft: false }, async () => {
    if (siteUrl && uniquePaths.length > 0) {
      await mapWithConcurrency(uniquePaths, WARMUP_CONCURRENCY, async (path) => {
        try {
          const page = await getOnlinePageBySlug(appId, path);

          if (!page || page.dynamic) {
            result.routesSkipped += 1;
            return;
          }

          await prefetchStaticRoute(siteUrl, path);
          markRoutePrefetchedPageIds(routePrefetchedPageIds, page);
          result.routesWarmed += 1;
        } catch (error) {
          result.routesFailed += 1;
          warmupLogger.warn(
            `Failed to prefetch route ${path}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      });
    } else if (uniquePaths.length > 0) {
      result.routesSkipped += uniquePaths.length;
    }

    if (pageIds.length > 0) {
      await mapWithConcurrency(pageIds, WARMUP_CONCURRENCY, async (pageId) => {
        if (routePrefetchedPageIds.has(pageId)) {
          result.stylesSkipped += 1;
          return;
        }

        try {
          const warmed = await warmPageStylesForPageId(pageId);
          if (warmed) {
            result.stylesWarmed += 1;
          } else {
            result.stylesSkipped += 1;
          }
        } catch (error) {
          result.stylesFailed += 1;
          warmupLogger.warn(
            `Failed to warm page styles for ${pageId}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      });
    }
  });

  result.totalMs = Math.round(performance.now() - start);

  warmupLogger.info(
    `Publish warmup complete · routes: ${result.routesWarmed}/${result.routesSkipped}/${result.routesFailed} · styles: ${result.stylesWarmed}/${result.stylesSkipped}/${result.stylesFailed} · ${result.totalMs}ms`,
  );

  return result;
}
