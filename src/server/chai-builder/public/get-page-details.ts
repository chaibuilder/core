import { and, eq } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { pageDetailsCacheKey, pageDetailsCacheTags } from "./page-details-cache";

export type PageDetails = {
  seo: unknown;
  currentEditor: string | null;
  lastSaved: string | null;
  tracking: unknown;
  metadata: unknown;
  /** Ids of the shared JSON-LD schemas (Car, AutomotiveBusiness, …) attached to this page. */
  globalJsonLds: string[];
};

async function fetchPageDetailsQuery(appId: string, draftMode: boolean, pageId: string): Promise<PageDetails> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;
  const { data, error } = await safeQuery(() =>
    db
      .select({
        seo: table.seo,
        currentEditor: table.currentEditor,
        lastSaved: table.lastSaved,
        tracking: table.tracking,
        metadata: table.metadata,
        globalJsonLds: table.globalJsonLds,
      })
      .from(table)
      .where(and(eq(table.app, appId), eq(table.id, pageId)))
      .limit(1),
  );

  // A failed query must not read as a missing page (see fetchFullPage).
  if (error) {
    throw new Error("FAILED_TO_FETCH_PAGE_DETAILS", { cause: error });
  }

  if (!data?.[0]) {
    throw new Error("PAGE_NOT_FOUND");
  }

  const row = data[0];
  return {
    seo: row.seo ?? {},
    currentEditor: row.currentEditor,
    lastSaved: row.lastSaved,
    tracking: row.tracking,
    metadata: row.metadata ?? {},
    globalJsonLds: (row.globalJsonLds ?? []) as string[],
  };
}

export async function getPageDetails(pageId: string): Promise<PageDetails> {
  const state = getInitializedState();

  return await withChaiCache(
    fetchPageDetailsQuery,
    pageDetailsCacheKey(state.appId!, pageId),
    pageDetailsCacheTags(pageId),
    false,
    "fetchPageDetails",
  )(state.appId!, state.draftMode, pageId);
}
