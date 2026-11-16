import { has } from "lodash-es";
import { getFrameworkAdapter } from "~/server/framework-adapter";
import { warmPublishedPagesCache } from "~/server/chai-builder/public/warm-published-pages-cache";
import { getInitializedStateWithUser } from "~/server/chai-builder/state";

/**
 * Cache side effects of a mutating chai action.
 *
 * Mutating actions do not invalidate anything themselves — they report what
 * they touched as `tags` and `paths` on their result, and the caller is
 * expected to act on it. The builder's HTTP route does that; so must any other
 * transport that dispatches actions directly (the MCP server), or a publish
 * made through it leaves the live page serving its previous cached render.
 */

/** Next's default catch-all public route, used for layout-level invalidation. */
export const DEFAULT_CATCH_ALL_ROUTE = ["/(public)/[[...slug]]"];

export type ChaiActionCacheOptions = {
  catchAllRoute?: string[];
};

export function collectRevalidationTags(response: unknown): string[] {
  if (!response) return [];

  if (Array.isArray(response)) {
    return response.flatMap((item) =>
      item && typeof item === "object" && "tags" in item && Array.isArray(item.tags) ? item.tags : [],
    );
  }

  if (has(response, "tags")) {
    const { tags } = response as { tags?: string[] };
    return tags ?? [];
  }

  return [];
}

export function collectRevalidationPaths(response: unknown): string[] {
  if (!response || typeof response !== "object" || !("paths" in response)) {
    return [];
  }

  const { paths } = response as { paths?: string[] };
  return paths ?? [];
}

async function invalidate(tags: string[], paths: string[], catchAllRoute?: string[]): Promise<void> {
  const { invalidatePath, invalidateTag } = getFrameworkAdapter();

  if (tags.length === 0 && !paths?.length) {
    return;
  }

  const revalidateTagFn = (tag: string) =>
    invalidateTag.length >= 2 ? invalidateTag(tag, "max") : invalidateTag(tag);

  const invalidations: Array<void | Promise<void>> = [];

  if (tags.some((tag) => tag.startsWith("website-settings-"))) {
    invalidations.push(
      ...(catchAllRoute?.map((route) => invalidatePath(route, "layout")) ?? []),
      revalidateTagFn("website-settings"),
    );
  }

  if (tags.length) {
    invalidations.push(...tags.map(revalidateTagFn));
  }

  if (paths?.length) {
    invalidations.push(...paths.map((path) => invalidatePath(path)));
  }

  if (invalidations.length) {
    await Promise.all(invalidations);
  }
}

/**
 * Invalidate everything an action reported, and — for a publish — warm the
 * routes that were just invalidated so the first visitor does not pay for the
 * cold render. The warm-up is deferred until after the response and never
 * blocks the caller.
 */
export async function applyChaiActionCacheEffects(
  action: string,
  result: unknown,
  options: ChaiActionCacheOptions = {},
): Promise<void> {
  const { catchAllRoute = DEFAULT_CATCH_ALL_ROUTE } = options;
  const tags = collectRevalidationTags(result);
  const paths = collectRevalidationPaths(result);

  await invalidate(tags, paths, catchAllRoute);

  if (action !== "PUBLISH_CHANGES" || (tags.length === 0 && paths.length === 0)) {
    return;
  }

  const { appId, siteUrl } = getInitializedStateWithUser();
  getFrameworkAdapter().runAfterResponse(() => warmPublishedPagesCache({ appId, siteUrl, tags, paths }));
}
