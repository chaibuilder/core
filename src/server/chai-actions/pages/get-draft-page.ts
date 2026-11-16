import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ActionError } from "~/server/chai-actions/action-error";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { linkedUpstreamId } from "~/server/chai-builder/public/get-upstream-full-page";
import { getConfigUpstreamPageSource } from "~/server/defaults/config-registry";

export type GetDraftPageActionData = {
  id: string;
};

type GetDraftPageActionResponse = {
  id: string;
  name: string;
  slug: string;
  lang: string;
  primaryPage?: string | null;
  seo: any;
  pageType?: string | null;
  lastSaved?: string | null;
  dynamic: boolean | null;
  parent?: string | null;
  blocks: any[];
  languagePageId: string;
  tracking: Record<string, any>;
  globalJsonLds: string[];
};

export class GetDraftPageAction extends ChaiBaseAction<GetDraftPageActionData, GetDraftPageActionResponse> {
  protected getValidationSchema() {
    return z.object({
      id: z.string(),
    });
  }

  async execute(data: GetDraftPageActionData): Promise<GetDraftPageActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET", 500);
    }

    const { appId } = this.context;
    const { id } = data;

    // Always use the draft table for this action
    const targetTable = schema.appPages;

    // Get page data and blocks in a single query using a subquery
    const { data: pageData, error } = await safeQuery(() =>
      db
        .select({
          id: targetTable.id,
          name: targetTable.name,
          slug: targetTable.slug,
          lang: targetTable.lang,
          primaryPage: targetTable.primaryPage,
          seo: targetTable.seo,
          currentEditor: targetTable.currentEditor,
          pageType: targetTable.pageType,
          lastSaved: targetTable.lastSaved,
          dynamic: targetTable.dynamic,
          parent: targetTable.parent,
          blocks: targetTable.blocks,
          tracking: targetTable.tracking,
          globalJsonLds: targetTable.globalJsonLds,
          upstream: targetTable.upstream,
          useUpstream: targetTable.useUpstream,
        })
        .from(targetTable)
        .where(and(eq(targetTable.app, appId), eq(targetTable.id, id), isNull(targetTable.deletedAt)))
        .limit(1),
    );

    // A query failure is an infrastructure problem, not a missing page. Keeping the
    // two apart lets callers (e.g. the partial block watcher in the outline) treat a
    // 404 as "this page was deleted" instead of "try again later".
    if (error) {
      throw new ActionError("Failed to fetch page", "PAGE_FETCH_FAILED", 500, error);
    }

    if (!pageData || pageData.length === 0) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND", 404);
    }

    const page = pageData[0];

    const primaryPageId = page.primaryPage ?? page.id;

    // Get blocks from the primary page if different from current page
    let blocks = (page.blocks as any[]) ?? [];

    if (primaryPageId !== page.id) {
      // Need to fetch blocks from primary page
      const { data: primaryPageData, error: primaryPageError } = await safeQuery(() =>
        db
          .select({
            blocks: targetTable.blocks,
          })
          .from(targetTable)
          .where(and(eq(targetTable.app, appId), eq(targetTable.id, primaryPageId), isNull(targetTable.deletedAt)))
          .limit(1),
      );

      if (primaryPageError) {
        throw new ActionError("Failed to fetch page blocks", "BLOCKS_FETCH_FAILED", 500, primaryPageError);
      }

      // The primary page is gone (deleted), so this language page has no content to show.
      if (!primaryPageData || primaryPageData.length === 0) {
        throw new ActionError("Page not found", "PAGE_NOT_FOUND", 404);
      }

      blocks = (primaryPageData[0]?.blocks as any[]) ?? [];
    }

    // A linked page shows what it renders: its upstream page's content, made this site's. Read-only:
    // UPDATE_PAGE refuses its content until it is cloned.
    const upstreamId = linkedUpstreamId(page);
    const upstreamContent = upstreamId ? await this.readUpstreamContent(upstreamId, appId) : undefined;
    if (upstreamId) blocks = upstreamContent?.blocks ?? [];

    return {
      ...page,
      ...(upstreamId ? { seo: upstreamContent?.seo ?? {} } : {}),
      blocks,
      id,
      languagePageId: page.id,
      tracking: page.tracking ?? {},
      globalJsonLds: (page.globalJsonLds ?? []) as string[],
    };
  }

  /** The upstream page's content as this app's, or null when it is gone (it then renders a 404). */
  private async readUpstreamContent(upstreamId: string, appId: string) {
    try {
      return (await getConfigUpstreamPageSource()?.getContent(upstreamId, { appId })) ?? null;
    } catch (error) {
      throw new ActionError("Failed to read upstream page", "UPSTREAM_LOOKUP_FAILED", 500, error);
    }
  }
}
