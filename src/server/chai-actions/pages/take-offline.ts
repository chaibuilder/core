import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ActionError } from "~/server/chai-actions/action-error";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { LAYOUTS_INDEX_TAG } from "~/server/chai-builder/public/get-layout-id-by-name";
import {
  pageSlugTag,
  routingTagsForPageIds,
  slugTag,
  upstreamSiteTag,
} from "~/server/chai-builder/public/page-routing-cache";

/**
 * Data type for TakeOfflineAction
 */
export type TakeOfflineActionData = {
  id: string;
};

type TakeOfflineActionResponse = {
  tags: string[];
  paths: string[];
  page?: any;
};

/**
 * Action to take a page offline
 * This includes:
 * - Setting the page's online status to false
 * - Removing the page from the online pages table
 * - Handling different page types (primary, language, partial)
 */
export class TakeOfflineAction extends ChaiBaseAction<TakeOfflineActionData, TakeOfflineActionResponse> {
  private appId: string = "";

  /**
   * Define the validation schema for take offline action
   */
  protected getValidationSchema() {
    return z.object({
      id: z.string().min(1, "Page ID is required"),
    });
  }

  /**
   * Execute the take offline action
   */
  async execute(data: TakeOfflineActionData): Promise<TakeOfflineActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    this.appId = this.context.appId;

    try {
      // Execute the take offline operation
      return await this.takeOffline(data.id);
    } catch (error) {
      // Handle known errors
      if (error instanceof ActionError) {
        throw error;
      }

      // Convert other errors to ActionError
      const message = error instanceof Error ? error.message : "Failed to take page offline";
      throw new ActionError(message, "TAKE_OFFLINE_ERROR");
    }
  }

  /**
   * Main take offline logic
   */
  private async takeOffline(id: string): Promise<TakeOfflineActionResponse> {
    // Get the page type
    const pageType = await this.getPageType(id);

    // Update the page's online status to false
    const { error: updateError } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({ online: false })
        .where(and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId))),
    );

    if (updateError) {
      throw new ActionError("Error taking page offline", "ERROR_TAKING_PAGE_OFFLINE");
    }

    // Delete from online pages table
    const cascadeDeletedIds = await this.deleteOnlinePage(id);

    // Handle different page types
    if (pageType === "language") {
      const primaryPage = await this.getPrimaryPage(id);
      return {
        tags: [...routingTagsForPageIds([primaryPage]), pageSlugTag(id), pageSlugTag(primaryPage)],
        paths: [],
      };
    }

    if (pageType === "partial") {
      const pagesUsingPartial = await this.getPartialBlockUsage(id);
      // Linked pages merge this site's partials without listing them in `partialBlocks`.
      const tags = [...routingTagsForPageIds(pagesUsingPartial), upstreamSiteTag(this.appId)];

      // Invalidate layout name→id cache when taking a `_layout` offline
      const { data: pageRow } = await safeQuery(() =>
        db
          .select({ pageType: schema.appPages.pageType })
          .from(schema.appPages)
          .where(and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId)))
          .limit(1),
      );
      if (pageRow?.[0]?.pageType === "_layout") {
        tags.push(LAYOUTS_INDEX_TAG);
      }

      return {
        tags,
        paths: [],
      };
    }

    // For primary pages, return the page data
    const { data: pages, error: pageError } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          slug: schema.appPages.slug,
          lang: schema.appPages.lang,
          pageType: schema.appPages.pageType,
          name: schema.appPages.name,
          online: schema.appPages.online,
          seo: schema.appPages.seo,
        })
        .from(schema.appPages)
        .where(eq(schema.appPages.id, id)),
    );

    if (pageError || !pages || pages.length === 0) {
      throw new ActionError("Error getting page after taking offline", "ERROR_TAKING_PAGE_OFFLINE");
    }

    return {
      tags: [
        ...routingTagsForPageIds([id]),
        pageSlugTag(id),
        ...cascadeDeletedIds.map(pageSlugTag),
        slugTag(pages[0].slug!),
      ],
      paths: [pages[0].slug!],
      page: pages[0],
    };
  }

  /**
   * Delete page from online pages table.
   * Returns the ids of language pages cascade-deleted via primaryPage.
   */
  private async deleteOnlinePage(id: string): Promise<string[]> {
    // Delete the page itself
    const { error: deleteError } = await safeQuery(() =>
      db.delete(schema.appPagesOnline).where(eq(schema.appPagesOnline.id, id)),
    );

    if (deleteError) {
      throw new ActionError(
        "Error deleting page from online pages table",
        "ERROR_DELETING_PAGE_FROM_ONLINE_PAGES_TABLE",
      );
    }

    // Delete pages where this is the primary page
    const { data: deletedLangPages, error: deletePrimaryError } = await safeQuery(() =>
      db
        .delete(schema.appPagesOnline)
        .where(eq(schema.appPagesOnline.primaryPage, id))
        .returning({ id: schema.appPagesOnline.id }),
    );

    if (deletePrimaryError) {
      throw new ActionError(
        "Error deleting page from online pages table",
        "ERROR_DELETING_PAGE_FROM_ONLINE_PAGES_TABLE",
      );
    }

    return (deletedLangPages ?? []).map((row) => row.id);
  }

  /**
   * Get the page type
   */
  private async getPageType(id: string): Promise<"primary" | "partial" | "language"> {
    const { data: pages, error } = await safeQuery(() =>
      db
        .select({
          primaryPage: schema.appPages.primaryPage,
          pageType: schema.appPages.pageType,
          slug: schema.appPages.slug,
        })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId))),
    );

    if (error || !pages || pages.length === 0) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND");
    }

    const page = pages[0]!;
    const isEmpty = (str: string | null | undefined) => !str || str.trim() === "";

    return isEmpty(page.slug) ? "partial" : !page.primaryPage ? "primary" : "language";
  }

  /**
   * Get the primary page ID for a language page
   */
  private async getPrimaryPage(id: string): Promise<string> {
    const { data: pages, error } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          primaryPage: schema.appPages.primaryPage,
        })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId))),
    );

    if (error || !pages || pages.length === 0) {
      throw new ActionError("Error getting primary page", "ERROR_GETTING_PRIMARY_PAGE");
    }

    const page = pages[0]!;
    return page.primaryPage ?? page.id;
  }

  /**
   * Get pages that use this partial block
   */
  private async getPartialBlockUsage(partialId: string): Promise<string[]> {
    const { data: pages, error } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          partialBlocks: schema.appPages.partialBlocks,
        })
        .from(schema.appPages)
        .where(eq(schema.appPages.app, this.appId)),
    );

    if (error || !pages) {
      return [];
    }

    // Filter pages that contain this partial block ID in their partialBlocks string
    return pages
      .filter((page) => {
        const partialBlocks = page.partialBlocks || "";
        return partialBlocks.split("|").includes(partialId);
      })
      .map((page) => page.id);
  }
}
