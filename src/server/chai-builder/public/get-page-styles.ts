import { consola } from "consola";
import type { ChaiBlock } from "~/types";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { getBlocksStyles } from "./get-blocks-styles";
import { FULL_PAGE_MERGE_VERSION } from "./full-page-merge-version";
import { upstreamPageTag, upstreamSiteTag } from "./page-routing-cache";
import { filterDuplicateStyles, getGlobalStylesFingerprint, preloadBaseStyleSelectors } from "./styles-helper";

const SLOW_PAGE_STYLES_MS = 30;
const pageStylesLogger = consola.withTag("ChaiPageStyles");

// Bump when the CSS compiler's *output* changes (not just its inputs). Persisted page styles live
// in the Data Cache, which outlives deployments, so the key must change or an older deploy's output
// keeps being served. v2: the min-width `@media` sort no longer depends on postcss (which is not
// bundled into the v4 serverless runtime), so previously-cached *unsorted* CSS — the cause of
// breakpoint-forked menus rendering both variants — must be recomputed. v3: Tailwind v3 values
// for shadow-sm / drop-shadow-sm / blur-sm / backdrop-blur-sm / bare ring (V3_SCALE). v4: v3
// `outline-none` and bare `ring` color (V3_COMPAT_CSS).
const PAGE_STYLES_COMPILER_VERSION = "4";

// Stable function reference for caching - defined once at module level
export async function fetchPageStylesUncached(blocks: ChaiBlock[]): Promise<string> {
  const blockCount = blocks.length;
  const start = performance.now();

  try {
    // Warm the duplicate-filter selector cache while Tailwind compiles the block styles.
    preloadBaseStyleSelectors();
    const styles = await getBlocksStyles(blocks);
    const minifiedStyles = styles.replace(/\s+/g, " ").trim();
    return await filterDuplicateStyles(minifiedStyles);
  } finally {
    const durationMs = Math.round(performance.now() - start);
    if (durationMs > SLOW_PAGE_STYLES_MS) {
      pageStylesLogger.warn(`Slow page styles compile: ${durationMs}ms · blocks: ${blockCount}`);
    }
  }
}

/** `upstreamId`: a linked page's styles also follow its upstream page. */
export const getPageStyles = async (pageId: string, blocks: ChaiBlock[], upstreamId?: string | null) => {
  try {
    return await getPageStylesCached(pageId, blocks, upstreamId);
  } catch (error) {
    // Degrade to the global stylesheet rather than failing the page render. Caught outside the
    // cache wrapper so the failure is not persisted: the next request retries the compile.
    pageStylesLogger.error(`Page styles compile failed; rendering without page styles · page: ${pageId}`, error);
    return "";
  }
};

/** The cached compile without the render fallback: rejects on failure (publish warmup counts it). */
export const getPageStylesCached = async (pageId: string, blocks: ChaiBlock[], upstreamId?: string | null) => {
  const state = getInitializedState();
  // Persisted caches outlive deployments, so the key carries the compiler version (bumped when
  // the compiler's output changes, see above), the global stylesheet fingerprint (duplicates are
  // filtered against the global CSS, so cached page styles must not outlive it), and the
  // partial-merge version: the compiled CSS is a function of the *merged* blocks passed in, and
  // nothing else in the key hashes them — so when the merge output changes (deeper partial
  // expansion inlining new blocks), the styles must recompile too or the new blocks render with
  // stale CSS.
  const globalFingerprint = await getGlobalStylesFingerprint();
  return await withChaiCache(
    fetchPageStylesUncached,
    [
      `page-styles-${state.appId}-${pageId}-c${PAGE_STYLES_COMPILER_VERSION}-m${FULL_PAGE_MERGE_VERSION}-g-${globalFingerprint}`,
    ],
    [
      `page-styles`,
      `page-${pageId}`,
      ...(upstreamId ? [upstreamPageTag(upstreamId), upstreamSiteTag(state.appId!)] : []),
    ],
    false,
    "fetchPageStyles",
  )(blocks);
};
