import { compact, isArray, omit, uniq } from "lodash-es";
import { getFrameworkAdapter } from "~/server/framework-adapter";
import { getOptionalRequestState } from "../state";

/**
 * Tag for "any data served by repeater source <sourceId> in app <appId>".
 * Fired via the revalidate webhook when the source's underlying data changes.
 */
export function repeaterDataTag(appId: string, sourceId: string): string {
  return `repeater-data-${appId}-${sourceId}`;
}

const noopQuery = async () => null;

/**
 * Attaches cache tags to the route currently rendering, so `revalidateTag(tag)`
 * regenerates every page that registered it. Backed by a null-payload
 * persistent-cache entry: invoking `unstable_cache` merges its tags into the
 * route's work store on every call (hit or miss), which is the same mechanism
 * that propagates `withChaiCache` tags. Nested `unstable_cache` calls do NOT
 * propagate tags, so this must run outside any persistently cached function.
 *
 * No-op in draft mode — draft uses the memory cache strategy and renders
 * dynamically, so tags are inert there. Callers running outside the chai
 * request context (e.g. render components) cannot rely on that internal check
 * and must gate on their own `draft` prop before calling.
 */
export async function registerCacheTags(tags: string[]): Promise<void> {
  const cleaned = uniq(compact(tags)).sort();
  if (cleaned.length === 0) return;
  if (getOptionalRequestState()?.draftMode) return;

  await getFrameworkAdapter().persistentCache(noopQuery, ["chai-render-tags", ...cleaned], {
    revalidate: false,
    tags: cleaned,
  })();
}

/**
 * The one implementation of the provider `$cacheTags` convention, shared by
 * every data-provider path — block `dataProvider` and repeater `fetch` alike.
 * A provider may include `$cacheTags: string[]` in its result; the key is
 * always stripped before the data is used, and registered as route cache tags
 * only when `register` is true (live render — never in the builder).
 *
 * `$notFound` — the page-type provider's "the item behind this URL does not
 * exist" signal — is stripped here too, so no envelope key ever reaches the
 * bindings. Acting on it is the caller's job (`getDataByPageType`); the
 * builder deliberately ignores it.
 */
export async function consumeProviderTags<T extends Record<string, unknown>>(
  result: T,
  register: boolean,
): Promise<Omit<T, "$cacheTags" | "$notFound">> {
  const tags = result?.$cacheTags;
  if (register && isArray(tags)) {
    await registerCacheTags(tags as string[]);
  }
  return omit(result, ["$cacheTags", "$notFound"]);
}
