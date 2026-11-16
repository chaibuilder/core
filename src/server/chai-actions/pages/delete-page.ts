import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { ActionError } from "~/server/chai-actions/action-error";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { db, type DbInstance, getDbDialect, safeQuery, schema } from "~/server/chai-actions/db";
import { apiError } from "~/server/chai-actions/lib";
import type { PageTreeNode } from "~/server/chai-actions/utils/page-tree-builder";
import { PageTreeBuilder } from "~/server/chai-actions/utils/page-tree-builder";
import { routingTagsForPages, upstreamSiteTag } from "~/server/chai-builder/public/page-routing-cache";

// Trashing removed the online row, so a restored page is never live (pages trashed
// before trash set `online: false` still carry `online: true`).
const RESTORED_DRAFT = { deletedAt: null, deletedBy: null, online: false };

/**
 * Data type for DeletePageAction
 */
export type DeletePageActionData = {
  id: string;
  permanent?: boolean;
};

export type DeletePageActionResponse = {
  tags: string[];
  page?: any;
  deletedLanguagePages?: number;
  deletedNestedChildren?: number;
  totalDeleted?: number;
  code?: string;
  editor?: string;
};

/**
 * Action to delete a page and all its associated data
 * This includes:
 * - The page itself
 * - All nested children pages
 * - All language variant pages
 * - Language variants of nested children
 */
export class DeletePageAction extends ChaiBaseAction<DeletePageActionData, DeletePageActionResponse> {
  private appId: string = "";
  private userId: string = "";
  private permanent: boolean = false;
  private pageTreeBuilder?: PageTreeBuilder;

  /**
   * Define the validation schema for delete page action
   */
  protected getValidationSchema() {
    return z.object({
      id: z.string().min(1, "Page ID is required"),
      permanent: z.boolean().optional(),
    });
  }

  /**
   * Execute the delete page action
   */
  async execute(data: DeletePageActionData): Promise<DeletePageActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    this.appId = this.context.appId;
    this.userId = this.context.userId || "";
    this.permanent = data.permanent || false;

    try {
      // Initialize PageTreeBuilder with ORM
      this.pageTreeBuilder = new PageTreeBuilder(this.appId);

      // Execute the delete operation
      return await this.deletePage(data.id);
    } catch (error) {
      // Handle known errors
      if (error instanceof ActionError) {
        throw error;
      }

      // Convert other errors to ActionError
      const message = error instanceof Error ? error.message : "Failed to delete page";
      throw new ActionError(message, "DELETE_PAGE_ERROR");
    }
  }

  /**
   * Main delete page logic
   */
  public async deletePage(id: string): Promise<any> {
    await this.assertNotHomepage(id);

    // Check if page is currently being edited by another user
    const currentEditor = await this.getCurrentEditor(id);
    if (currentEditor && currentEditor !== this.userId) {
      return { tags: [], code: "PAGE_LOCKED", editor: currentEditor };
    }

    const pagesTree = await this.pageTreeBuilder!.getPagesTree();

    const pageInLanguageTree = this.pageTreeBuilder!.findPageInLanguageTree(id, pagesTree.languageTree);
    const pageInPrimaryTree = this.pageTreeBuilder!.findPageInPrimaryTree(id, pagesTree.primaryTree);

    if (!pageInLanguageTree && !pageInPrimaryTree) {
      throw apiError("ERROR_DELETING_PAGE", "Page not found");
    }

    const isLanguagePage = pageInLanguageTree !== null;

    const result = isLanguagePage
      ? await this.deleteLanguagePageWithTree(id, pageInLanguageTree!, pagesTree)
      : await this.deletePrimaryPageWithTree(id, pagesTree);
    // A linked page may hold a partial or a link match of the deleted page.
    return { ...result, tags: [...result.tags, upstreamSiteTag(this.appId)] };
  }

  /**
   * The homepage owns "/" — deleting it (or trashing it) would leave the site
   * without a root route, so it can only go away by handing "/" to another
   * page first (promotion demotes the current homepage automatically).
   *
   * Only the primary row at "/" is protected: language variants live at
   * "/<lang>", and an already-trashed row is exempt so a permanent delete can
   * still clear pages trashed before this rule existed.
   */
  private async assertNotHomepage(id: string): Promise<void> {
    const { data: page, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId)),
        columns: { slug: true, primaryPage: true, deletedAt: true },
      }),
    );

    if (error) {
      throw new ActionError(`Failed to fetch page: ${error.message}`, "FETCH_FAILED");
    }

    // Missing or out-of-app row: the tree lookup below reports it as not found.
    if (!page) return;

    if (page.slug === "/" && !page.primaryPage && !page.deletedAt) {
      throw new ActionError(
        "The homepage cannot be deleted. Make another page the homepage first.",
        "HOMEPAGE_DELETE_FORBIDDEN",
      );
    }
  }

  /**
   * Perform Deletion With Ids using Drizzle ORM
   */
  public async performDeletionWithIds(ids: string[]): Promise<any> {
    const reverseIds = [...ids].reverse();
    const permanent = this.permanent;
    const userId = this.userId;

    const writes = async (q: DbInstance) => {
      if (permanent) {
        await q.delete(schema.libraryTemplates).where(inArray(schema.libraryTemplates.pageId, reverseIds));
        await q.delete(schema.appPagesRevisions).where(inArray(schema.appPagesRevisions.id, reverseIds));
      }
      await q.delete(schema.appPagesOnline).where(inArray(schema.appPagesOnline.id, reverseIds));
      await (permanent
        ? q.delete(schema.appPages).where(inArray(schema.appPages.id, reverseIds))
        : q
            .update(schema.appPages)
            // The online row is gone, so the draft must stop claiming it is live.
            .set({ deletedAt: new Date().toISOString(), deletedBy: userId, online: false })
            .where(inArray(schema.appPages.id, reverseIds)));
    };

    // Postgres: one transaction, so a failed write never leaves a page trashed but
    // still served, or offline with its menu cache tags lost. The sqlite adapters
    // run the writes in sequence (better-sqlite3 transactions cannot await), online
    // rows first, so a failure there leaves the page offline but not trashed.
    const { error } = await safeQuery(() =>
      getDbDialect() === "pg" ? db.transaction((tx) => writes(tx as unknown as DbInstance)) : writes(db),
    );
    if (error) throw apiError("DELETE_FAILED", error);
  }

  /**
   * Collect routing tags from tree nodes for deleted pages
   */
  private collectRoutingTagsFromTree(ids: string[], tree: PageTreeNode[]): string[] {
    const nodes: Array<{ id: string; slug?: string; primaryPage?: string | null }> = [];

    const walk = (treeNodes: PageTreeNode[]) => {
      for (const node of treeNodes) {
        if (ids.includes(node.id)) {
          nodes.push({ id: node.id, slug: node.slug, primaryPage: node.primaryPage });
        }
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    };

    walk(tree);
    return routingTagsForPages(nodes);
  }

  /**
   * Delete a language page using tree data
   */
  public async deleteLanguagePageWithTree(id: string, langNode: any, pagesTree: any): Promise<any> {
    const primaryPageId = langNode.primaryPage;
    const primaryNode = this.pageTreeBuilder!.findPageInPrimaryTree(primaryPageId, pagesTree.primaryTree);

    if (!primaryNode) {
      throw apiError("ERROR_DELETING_PAGE", "Primary page not found");
    }
    const allNestedLanguageIds = this.pageTreeBuilder!.collectNestedChildIds(langNode);
    const deletedIds = [id, ...allNestedLanguageIds];

    await this.performDeletionWithIds(deletedIds);
    return {
      tags: this.collectRoutingTagsFromTree(deletedIds, pagesTree.languageTree),
      totalDeleted: deletedIds.length,
    };
  }

  /**
   * Delete a primary page using tree data
   */
  public async deletePrimaryPageWithTree(id: string, pagesTree: any): Promise<any> {
    const primaryNode = this.pageTreeBuilder!.findPageInPrimaryTree(id, pagesTree.primaryTree);

    if (!primaryNode) {
      throw apiError("ERROR_DELETING_PAGE", "Primary page not found");
    }
    const nestedPrimaryChildIds = this.pageTreeBuilder!.collectNestedChildIds(primaryNode);

    const languageVariants = this.pageTreeBuilder!.findLanguagePagesForPrimary(id, pagesTree.languageTree);
    const languagePageIds: string[] = [];

    languageVariants.forEach((langVariant) => {
      languagePageIds.push(langVariant.id);
      const nestedIds = this.pageTreeBuilder!.collectNestedChildIds(langVariant);
      languagePageIds.push(...nestedIds);
    });

    const allLanguagePageIds = [...new Set([...nestedPrimaryChildIds, ...languagePageIds])];
    const deletedIds = [id, ...allLanguagePageIds];
    await this.performDeletionWithIds(deletedIds);
    return {
      tags: [
        ...this.collectRoutingTagsFromTree(deletedIds, pagesTree.primaryTree),
        ...this.collectRoutingTagsFromTree(deletedIds, pagesTree.languageTree),
      ].filter((tag, index, arr) => arr.indexOf(tag) === index),
      totalDeleted: deletedIds.length,
    };
  }

  /**
   * Get current editor for a page
   */
  public async getCurrentEditor(id: string): Promise<string | null> {
    const { data, error } = await safeQuery(() =>
      db
        .select({ currentEditor: schema.appPages.currentEditor })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId)))
        .limit(1),
    );

    if (error || !data || data.length === 0) return null;
    return data[0]?.currentEditor || null;
  }

  /**
   * Restore a page and all its nested children and language pages.
   * Returns the routing tags of any live rows the restore removed.
   */
  public async restorePage(id: string): Promise<string[]> {
    if (!this.pageTreeBuilder) {
      this.pageTreeBuilder = new PageTreeBuilder(this.context!.appId);
    }

    const pagesTree = await this.pageTreeBuilder.getPagesTree();

    const pageInLanguageTree = this.pageTreeBuilder.findPageInLanguageTree(id, pagesTree.languageTree);
    const pageInPrimaryTree = this.pageTreeBuilder.findPageInPrimaryTree(id, pagesTree.primaryTree);

    if (!pageInLanguageTree && !pageInPrimaryTree) {
      throw apiError("ERROR_RESTORING_PAGE", "Page not found");
    }

    const isLanguagePage = pageInLanguageTree !== null;

    if (isLanguagePage) {
      return await this.restoreLanguagePageWithTree(id, pageInLanguageTree!, pagesTree);
    } else {
      return await this.restorePrimaryPageWithTree(id, pagesTree);
    }
  }

  /**
   * Restore the still-trashed rows among ids: drop any live row they still have
   * (a page trashed while live, before trash cleared the online row), then flip
   * the drafts back to unpublished. Returns the routing tags of the removed live rows.
   */
  private async restoreWithIds(ids: string[]): Promise<string[]> {
    let removedRows: Array<{ id: string; slug: string | null; primaryPage: string | null }> = [];

    const writes = async (q: DbInstance) => {
      // Lock the still-trashed rows first (Postgres): a concurrent restore of the same
      // rows waits here, and one that already committed leaves nothing to lock. Only
      // the locked set is touched below, so a stale restore cannot delete a row that
      // was restored and republished since it read the ids.
      const trashedQuery = q
        .select({ id: schema.appPages.id })
        .from(schema.appPages)
        .where(and(inArray(schema.appPages.id, ids), isNotNull(schema.appPages.deletedAt)));
      const trashed = await (getDbDialect() === "pg" ? trashedQuery.for("update") : trashedQuery);

      const trashedIds = trashed.map((row) => row.id);
      if (trashedIds.length === 0) return;

      removedRows = await q
        .select({
          id: schema.appPagesOnline.id,
          slug: schema.appPagesOnline.slug,
          primaryPage: schema.appPagesOnline.primaryPage,
        })
        .from(schema.appPagesOnline)
        .where(inArray(schema.appPagesOnline.id, trashedIds));

      await q.delete(schema.appPagesOnline).where(inArray(schema.appPagesOnline.id, trashedIds));
      await q.update(schema.appPages).set(RESTORED_DRAFT).where(inArray(schema.appPages.id, trashedIds));
    };

    // Same transaction shape as performDeletionWithIds: on Postgres the lock, the
    // live-row delete and the draft update commit together. sqlite runs the reads and
    // writes in sequence, with no row lock, so a concurrent restore there can interleave.
    const { error } = await safeQuery(() =>
      getDbDialect() === "pg" ? db.transaction((tx) => writes(tx as unknown as DbInstance)) : writes(db),
    );
    if (error) throw apiError("RESTORE_FAILED", error);

    return routingTagsForPages(removedRows);
  }

  /**
   * Restore a language page and its nested children
   */
  private async restoreLanguagePageWithTree(id: string, langNode: any, _pagesTree: any): Promise<string[]> {
    const allNestedLanguageIds = this.pageTreeBuilder!.collectNestedChildIds(langNode);
    return this.restoreWithIds([id, ...allNestedLanguageIds]);
  }

  /**
   * Restore a primary page, its nested children, and all language variants
   */
  private async restorePrimaryPageWithTree(id: string, pagesTree: any): Promise<string[]> {
    const primaryNode = this.pageTreeBuilder!.findPageInPrimaryTree(id, pagesTree.primaryTree);

    if (!primaryNode) {
      throw apiError("ERROR_RESTORING_PAGE", "Primary page not found");
    }

    const nestedPrimaryChildIds = this.pageTreeBuilder!.collectNestedChildIds(primaryNode);

    const languageVariants = this.pageTreeBuilder!.findLanguagePagesForPrimary(id, pagesTree.languageTree);
    const languagePageIds: string[] = [];

    languageVariants.forEach((langVariant) => {
      languagePageIds.push(langVariant.id);
      const nestedIds = this.pageTreeBuilder!.collectNestedChildIds(langVariant);
      languagePageIds.push(...nestedIds);
    });

    return this.restoreWithIds([id, ...nestedPrimaryChildIds, ...languagePageIds]);
  }
}
