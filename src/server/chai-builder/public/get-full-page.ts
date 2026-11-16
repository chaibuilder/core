import { and, eq, inArray } from "drizzle-orm";
import { compact, uniq } from "lodash-es";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { ChaiBlock, ChaiPage } from "~/types";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
// Versioning rationale and bump history live with the constant — see full-page-merge-version.ts.
import { FULL_PAGE_MERGE_VERSION } from "./full-page-merge-version";
import { assignNewIds, collectPartialBlocksMap, replacePartialBlocks } from "./partial-merge-utils";

export { assignNewIds };

export type GetFullPageOptions = {
  id: string;
  draft: boolean;
  mergeGlobal?: boolean;
  mergePartials?: boolean;
  partialBlocks?: string | null;
  editor?: boolean;
  userId?: string;
};

export type ChaiFullPageResult = Pick<
  ChaiPage,
  | "id"
  | "name"
  | "slug"
  | "lang"
  | "primaryPage"
  | "seo"
  | "currentEditor"
  | "pageType"
  | "lastSaved"
  | "dynamic"
  | "parent"
  | "blocks"
> & {
  /** Partial page ids merged into `blocks`. Optional: cache entries written before this field existed lack it. */
  partialIds?: string[];
};

export const getFullPage = async (
  pageId: string,
  options?: Partial<GetFullPageOptions>,
): Promise<ChaiFullPageResult> => {
  const state = getInitializedState();

  return await withChaiCache(
    fetchFullPage,
    [`full-page-${state.appId}-${pageId}-m${FULL_PAGE_MERGE_VERSION}`],
    [`full-page`, `page-${pageId}`],
    false,
    "fetchFullPage",
  )(state.appId!, state.draftMode, pageId, options);
};

// Stable function reference for caching - defined once at module level
async function fetchFullPage(
  appId: string,
  draftMode: boolean,
  pageId: string,
  options?: { mergeGlobal?: boolean; mergePartials?: boolean; partialBlocks?: string | null },
): Promise<ChaiFullPageResult> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;

  // 1. Fetch page metadata including partialBlocks column
  //    Skip if partialBlocks was pre-provided via options
  const hasPreProvidedPartials = options?.partialBlocks !== undefined;
  let page: {
    id: string;
    name: string;
    slug: string;
    lang: string;
    primaryPage: string | null;
    seo: unknown;
    currentEditor: string | null;
    pageType: string | null;
    lastSaved: string | null;
    dynamic: boolean | null;
    parent: string | null;
    partialBlocks: string | null;
  } | null = null;
  let primaryPageId = pageId;
  let partialBlocksValue = options?.partialBlocks ?? "";

  if (!hasPreProvidedPartials) {
    const { data: pageResult, error } = await safeQuery(() =>
      db
        .select({
          id: table.id,
          name: table.name,
          slug: table.slug,
          lang: table.lang,
          primaryPage: table.primaryPage,
          seo: table.seo,
          currentEditor: table.currentEditor,
          pageType: table.pageType,
          lastSaved: table.lastSaved,
          dynamic: table.dynamic,
          parent: table.parent,
          partialBlocks: table.partialBlocks,
        })
        .from(table)
        .where(and(eq(table.app, appId), eq(table.id, pageId)))
        .limit(1),
    );

    // A failed query must not read as a missing page: PAGE_NOT_FOUND becomes a 404
    // the route cache keeps, while a thrown error is a 500 retried on the next request.
    if (error) {
      throw new Error("FAILED_TO_FETCH_PAGE", { cause: error });
    }

    if (!pageResult || pageResult.length === 0) {
      throw new Error("PAGE_NOT_FOUND");
    }

    page = pageResult[0];
    if (!page) {
      throw new Error("PAGE_NOT_FOUND");
    }

    primaryPageId = page.primaryPage ?? page.id;
    partialBlocksValue = (page.partialBlocks as string) ?? "";
  }

  // 2. Get partial page IDs from the partialBlocks column (pipe-separated)
  const partialIds = compact((partialBlocksValue || "").split("|"));

  // 3. Batch-fetch blocks for current page and all partial pages in one query
  const allPageIds = [primaryPageId, ...partialIds.filter((id) => id !== primaryPageId)];

  const { data: allBlocksResult, error: blocksError } = await safeQuery(() =>
    db
      .select({
        id: table.id,
        blocks: table.blocks,
        deletedAt: table.deletedAt,
      })
      .from(table)
      .where(and(eq(table.app, appId), inArray(table.id, allPageIds))),
  );

  if (blocksError) {
    throw new Error("FAILED_TO_FETCH_PAGE_BLOCKS", { cause: blocksError });
  }

  // Build a map of pageId -> blocks. Soft-deleted partials (in trash) are
  // excluded so their content never merges in draft mode; the page's own row
  // is kept regardless so page rendering behavior is unchanged.
  const blocksMap = new Map<string, ChaiBlock[]>();
  if (allBlocksResult) {
    allBlocksResult.forEach((result: { id: string; blocks: unknown; deletedAt: string | null }) => {
      if (result.deletedAt && result.id !== primaryPageId) return;
      blocksMap.set(result.id, (result.blocks as ChaiBlock[]) ?? []);
    });
  }

  let blocks = blocksMap.get(primaryPageId) ?? [];

  // 4. Merge partial blocks into the page blocks. The map is seeded from the
  //    denormalized partialBlocks column (batch-fetched above, zero extra
  //    queries when complete) and then completed by scanning for referenced
  //    partials the column missed — stale columns after a partial gained a
  //    nested partial, or pages authored outside the builder with no column
  //    at all.
  const shouldMergePartials = options?.mergeGlobal ?? options?.mergePartials ?? true;
  let mergedPartialIds: string[] = [];
  if (shouldMergePartials) {
    const partialBlocksMap = new Map<string, ChaiBlock[]>();
    partialIds.forEach((id) => {
      const partialBlocks = blocksMap.get(id);
      if (partialBlocks) {
        partialBlocksMap.set(id, partialBlocks);
      }
    });
    await collectPartialBlocksMap(blocks, partialBlocksMap, draftMode, appId);
    blocks = replacePartialBlocks(blocks, partialBlocksMap);
    // Column ∪ scanned references: covers stale columns the column alone would miss.
    mergedPartialIds = uniq([...partialIds, ...partialBlocksMap.keys()]).sort();
  }

  // If we fetched page metadata, return full info; otherwise return minimal
  if (page) {
    return {
      id: pageId,
      name: page.name,
      slug: page.slug,
      lang: page.lang,
      primaryPage: page.primaryPage,
      seo: page.seo ?? {},
      currentEditor: page.currentEditor,
      pageType: page.pageType!,
      lastSaved: page.lastSaved!,
      dynamic: page.dynamic!,
      parent: page.parent,
      blocks,
      partialIds: mergedPartialIds,
    };
  }

  // Pre-provided partialBlocks path: return blocks only with minimal metadata
  return {
    id: pageId,
    name: "",
    slug: "",
    lang: "",
    primaryPage: null,
    seo: {},
    currentEditor: null,
    pageType: null as any,
    lastSaved: null as any,
    dynamic: null as any,
    parent: null,
    blocks,
    partialIds: mergedPartialIds,
  };
}
