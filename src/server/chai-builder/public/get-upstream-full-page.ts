import { getConfigUpstreamPageSource, isFeatureEnabled } from "~/server/defaults/config-registry";
import type { ChaiBlock } from "~/types";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { FULL_PAGE_MERGE_VERSION } from "./full-page-merge-version";
import type { PageRoutingMetadata } from "./page-routing-cache";
import { upstreamPageTag, upstreamSiteTag } from "./page-routing-cache";
import { collectPartialBlocksMap, replacePartialBlocks } from "./partial-merge-utils";

export type UpstreamFullPage = {
  blocks: ChaiBlock[];
  seo: unknown;
  /** This app's partial ids merged into `blocks`. */
  partialIds: string[];
};

/** The upstream page id a routed page renders, or null when it renders its own content. */
export function linkedUpstreamId(page: Pick<PageRoutingMetadata, "upstream" | "useUpstream">): string | null {
  if (!page.useUpstream || !page.upstream) return null;
  return isFeatureEnabled("upstreamPages") ? page.upstream : null;
}

/**
 * A linked page's content: the upstream page's published blocks and SEO from the host's
 * `upstreamPageSource`, with any of this app's partials merged. Cached per (app, upstream page),
 * so every linked page of one app shares one entry.
 */
export const getUpstreamFullPage = async (upstreamId: string): Promise<UpstreamFullPage> => {
  const state = getInitializedState();

  return await withChaiCache(
    fetchUpstreamFullPage,
    [`upstream-full-page-${state.appId}-${upstreamId}-m${FULL_PAGE_MERGE_VERSION}`],
    ["full-page", upstreamPageTag(upstreamId), upstreamSiteTag(state.appId!)],
    false,
    "fetchUpstreamFullPage",
  )(state.appId!, state.draftMode, upstreamId);
};

// Stable function reference for caching - defined once at module level
async function fetchUpstreamFullPage(appId: string, draftMode: boolean, upstreamId: string): Promise<UpstreamFullPage> {
  const content = await getConfigUpstreamPageSource()?.getContent(upstreamId, { appId, live: !draftMode });
  if (!content) throw new Error("PAGE_NOT_FOUND");

  const blocks = content.blocks ?? [];
  const partialBlocksMap = new Map<string, ChaiBlock[]>();
  await collectPartialBlocksMap(blocks, partialBlocksMap, draftMode, appId);

  return {
    blocks: replacePartialBlocks(blocks, partialBlocksMap),
    seo: content.seo ?? {},
    partialIds: [...partialBlocksMap.keys()].sort(),
  };
}
