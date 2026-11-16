import { and, eq } from "drizzle-orm";
import { pick } from "lodash-es";
import { ActionError } from "~/server/chai-actions/action-error";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { PageTreeBuilder } from "~/server/chai-actions/utils/page-tree-builder";

/**
 * Handler for managing slug changes and their cascading effects
 */
export class SlugChangeHandler {
  private appId: string;
  private pageTreeBuilder?: PageTreeBuilder;

  constructor(appId: string) {
    this.appId = appId;
  }

  /**
   * Update a node's slug in the tree (mutates the tree in place)
   */
  private updateNodeSlugInTree(pageId: string, newSlug: string, tree: any[]): boolean {
    for (const node of tree) {
      if (node.id === pageId) {
        node.slug = newSlug;
        return true;
      }
      if (node.children && node.children.length > 0) {
        if (this.updateNodeSlugInTree(pageId, newSlug, node.children)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Validate that the new slug doesn't conflict with existing pages using tree data
   */
  private validateSlugAvailabilityInTree(
    newSlug: string,
    pageId: string,
    isDynamic: boolean,
    pagesTree: any,
    isLanguagePage: boolean = false,
  ): void {
    // Helper function to recursively check all nodes in a tree
    const hasConflict = (nodes: any[]): boolean => {
      for (const node of nodes) {
        // Check current node - use nullish coalescing (??) to handle undefined, and strict equality (===) for comparison
        const nodeIsDynamic = node.dynamic ?? false;
        // Ignore soft-deleted (tombstoned) pages: a deleted page must not reserve
        // its slug, otherwise deleting a page then recreating/moving another onto
        // the same slug fails. The tree still carries tombstones so trash flows
        // (restore, permanent delete) can locate them — only conflict detection
        // skips them. Still recurse into children in case of partial delete state.
        if (!node.deletedAt && node.slug === newSlug && node.id !== pageId && nodeIsDynamic === isDynamic) {
          return true;
        }
        // Recursively check children
        if (node.children && node.children.length > 0) {
          if (hasConflict(node.children)) {
            return true;
          }
        }
      }
      return false;
    };

    // Check in primary tree
    if (hasConflict(pagesTree.primaryTree)) {
      const errorMessage = isLanguagePage
        ? `Slug '${newSlug}' conflicts with a primary page slug. Language page slugs cannot overlap with primary page slugs.`
        : `Slug '${newSlug}' is already in use. Please choose another slug`;
      throw new ActionError(errorMessage, "SLUG_ALREADY_EXISTS");
    }

    // Check in language tree
    if (hasConflict(pagesTree.languageTree)) {
      const errorMessage = isLanguagePage
        ? `Slug '${newSlug}' is already in use by another language page. Please choose another slug.`
        : `Slug '${newSlug}' conflicts with a language page slug. Please choose another slug.`;
      throw new ActionError(errorMessage, "SLUG_ALREADY_EXISTS");
    }
  }

  /**
   * Check if slug has changed (lightweight check without DB query)
   */
  async isSlugChanged(pageId: string, newSlug?: string): Promise<boolean> {
    if (!newSlug) {
      return false;
    }

    const { data: result, error } = await safeQuery(() =>
      db
        .select({ slug: schema.appPages.slug })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)))
        .limit(1),
    );

    if (error || !result || result.length === 0) {
      return false;
    }

    const pageData = result[0];
    return pageData?.slug !== newSlug;
  }

  /**
   * Check if the parent is being changed (lightweight check without DB query)
   */
  async isParentChanged(pageId: string, newParent?: string | null): Promise<boolean> {
    if (newParent === undefined) return false;

    const { data: result, error } = await safeQuery(() =>
      db
        .select({ parent: schema.appPages.parent })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)))
        .limit(1),
    );

    if (error || !result || result.length === 0) {
      return false;
    }

    const pageData = result[0];
    return pageData?.parent !== newParent;
  }

  /**
   * Handle slug change using PageTreeBuilder (ONLY 1 DB query - the tree fetch)
   */
  async handleSlugChangeWithTree(
    pageId: string,
    filteredData: any,
  ): Promise<Array<{ id: string; oldSlug: string; newSlug: string }>> {
    const newSlug = filteredData.slug!;

    // Initialize PageTreeBuilder if not already done
    if (!this.pageTreeBuilder) {
      this.pageTreeBuilder = new PageTreeBuilder(this.appId);
    }

    // SINGLE DB QUERY: Get pages tree (fetches all pages at once)
    const pagesTree = await this.pageTreeBuilder.getPagesTree();

    // Find the page in the tree (no DB query needed)
    let currentPageNode = this.pageTreeBuilder.findPageInPrimaryTree(pageId, pagesTree.primaryTree);

    if (!currentPageNode) {
      // Try to find in language tree
      currentPageNode = this.pageTreeBuilder.findPageInLanguageTree(pageId, pagesTree.languageTree);

      if (!currentPageNode) {
        throw new ActionError("Page not found in tree", "PAGE_NOT_FOUND_IN_TREE");
      }
    }

    const oldSlug = currentPageNode.slug;
    const isDynamic = filteredData.dynamic ?? currentPageNode.dynamic ?? false;

    // Validate slug availability using tree data (no DB query)
    this.validateSlugAvailabilityInTree(newSlug, pageId, isDynamic, pagesTree);

    let slugUpdates: Array<{ id: string; oldSlug: string; newSlug: string }> = [];
    // Collect nested children slug updates
    const childSlugUpdates = this.pageTreeBuilder.collectNestedChildSlugs(currentPageNode, oldSlug, newSlug);
    slugUpdates = [{ id: pageId, oldSlug, newSlug }, ...childSlugUpdates];

    return slugUpdates;
  }

  /**
   * Handle parent change by recalculating slugs for the page and its children (ONLY 1 DB query - the tree fetch)
   */
  async handleParentChangeWithTree(
    pageId: string,
    filteredData: any,
  ): Promise<Array<{ id: string; oldSlug: string; newSlug: string }>> {
    const newParent = filteredData.parent!;

    // Initialize PageTreeBuilder if not already done
    if (!this.pageTreeBuilder) {
      this.pageTreeBuilder = new PageTreeBuilder(this.appId);
    }

    // SINGLE DB QUERY: Get pages tree (fetches all pages at once)
    const pagesTree = await this.pageTreeBuilder.getPagesTree();

    // Find the page in the tree (no DB query needed)
    const primaryNode = this.pageTreeBuilder.findPageInPrimaryTree(pageId, pagesTree.primaryTree);
    if (!primaryNode) {
      // Check if it's a language page trying to change parent
      const langNode = this.pageTreeBuilder.findPageInLanguageTree(pageId, pagesTree.languageTree);
      if (langNode) {
        throw new ActionError("Cannot change parent of language pages directly", "INVALID_OPERATION");
      }
      throw new ActionError("Primary page not found in tree", "PAGE_NOT_FOUND_IN_TREE");
    }

    const oldSlug = primaryNode.slug;

    // Calculate new slug based on new parent it can also have slug change
    const newSlug = filteredData.slug
      ? filteredData.slug
      : this.pageTreeBuilder.calculateSlugFromParent(newParent, oldSlug, pagesTree.primaryTree);

    // Validate new slug availability using tree data (no DB query)
    const isDynamic = filteredData.dynamic ?? primaryNode.dynamic ?? false;
    this.validateSlugAvailabilityInTree(newSlug, pageId, isDynamic, pagesTree);

    // Language variant validations must see the primary page's requested slug and dynamic state.
    this.updateNodeSlugInTree(pageId, newSlug, pagesTree.primaryTree);
    primaryNode.dynamic = isDynamic;

    // Collect nested children slug updates for primary page
    const childSlugUpdates = this.pageTreeBuilder.collectNestedChildSlugs(primaryNode, oldSlug, newSlug);
    const slugUpdates: Array<{ id: string; oldSlug: string; newSlug: string }> = [
      { id: pageId, oldSlug, newSlug },
      ...childSlugUpdates,
    ];

    // Also update child nodes' slugs in the local tree
    for (const childUpdate of childSlugUpdates) {
      this.updateNodeSlugInTree(childUpdate.id, childUpdate.newSlug, pagesTree.primaryTree);
    }

    // Also handle language variants when parent changes
    const languageVariants = this.pageTreeBuilder.findLanguagePagesForPrimary(pageId, pagesTree.languageTree);
    let parentLanguageNode;
    if (newParent) {
      parentLanguageNode = this.pageTreeBuilder.findLanguagePagesForPrimary(newParent, pagesTree.languageTree);
    }
    for (const langVariant of languageVariants) {
      // Calculate new slug for language variant, preserving language prefix
      const matchingParentLangNode = parentLanguageNode?.filter((node) => node.lang === langVariant.lang)[0];
      const languageVariantParentId = matchingParentLangNode?.id || null;

      const langVariantNewSlug = this.pageTreeBuilder.calculateSlugFromParent(
        languageVariantParentId,
        langVariant.slug,
        pagesTree.languageTree,
      );
      const langVariantIsDynamic = filteredData.dynamic ?? langVariant.dynamic ?? false;
      this.validateSlugAvailabilityInTree(langVariantNewSlug, langVariant.id, langVariantIsDynamic, pagesTree, true);

      // Subsequent variants must see this variant's requested slug and dynamic state.
      this.updateNodeSlugInTree(langVariant.id, langVariantNewSlug, pagesTree.languageTree);
      langVariant.dynamic = langVariantIsDynamic;

      // Collect nested children slug updates for language variant
      const langChildSlugUpdates = this.pageTreeBuilder.collectNestedChildSlugs(
        langVariant,
        langVariant.slug,
        langVariantNewSlug,
      );

      // Also update language variant child nodes' slugs in the local tree
      for (const langChildUpdate of langChildSlugUpdates) {
        this.updateNodeSlugInTree(langChildUpdate.id, langChildUpdate.newSlug, pagesTree.languageTree);
      }

      slugUpdates.push({ id: langVariant.id, oldSlug: langVariant.slug, newSlug: langVariantNewSlug });
      slugUpdates.push(...langChildSlugUpdates);
    }

    return slugUpdates;
  }

  /**
   * Batch update slugs in both app_pages and app_pages_online tables
   */
  async batchUpdateSlugs(
    slugUpdates: Array<{ id: string; newSlug: string }>,
    filteredData: any,
    mainPageId: string,
    changes: string[],
  ): Promise<void> {
    // Update app_pages table in parallel
    const pageUpdatePromises = slugUpdates.map(async (update) => {
      const updateData: any = {
        slug: update.newSlug,
        lastSaved: new Date().toISOString(),
      };

      // Only add other fields for the main page being updated
      if (update.id === mainPageId) {
        const additionalFields = pick(filteredData, [
          "name",
          "seo",
          "blocks",
          "currentEditor",
          "buildTime",
          "parent",
          "pageType",
          "dynamic",
          "dynamicSlugCustom",
          "links",
          "partialBlocks",
          "designTokens",
          // A tracking edit combined with a slug/parent change routes here;
          // without this the tracking payload is silently dropped.
          "tracking",
        ]);
        // Remove fields that are explicitly undefined to avoid unintended updates
        Object.keys(additionalFields).forEach((key) => {
          if (additionalFields[key as keyof typeof additionalFields] === undefined) {
            delete additionalFields[key as keyof typeof additionalFields];
          }
        });
        Object.assign(updateData, {
          ...additionalFields,
          changes,
        });
      }

      const { error } = await safeQuery(() =>
        db
          .update(schema.appPages)
          .set(updateData)
          .where(and(eq(schema.appPages.id, update.id), eq(schema.appPages.app, this.appId))),
      );

      if (error) {
        throw new ActionError(`Failed to update page ${update.id}`, "UPDATE_PAGE_FAILED");
      }

      return update.id;
    });

    // Wait for all page updates to complete, will throw on first error
    await Promise.all(pageUpdatePromises);

    // Update app_pages_online table in parallel
    // Ignore errors for online table as pages might not be published
    const onlineUpdatePromises = slugUpdates.map(async (update) => {
      // Intentionally ignore errors for online table as pages might not be published
      await safeQuery(() =>
        db
          .update(schema.appPagesOnline)
          .set({ slug: update.newSlug })
          .where(and(eq(schema.appPagesOnline.id, update.id), eq(schema.appPagesOnline.app, this.appId))),
      );
    });

    await Promise.all(onlineUpdatePromises);
  }

  /**
   * Set the PageTreeBuilder instance
   */
  setPageTreeBuilder(builder: PageTreeBuilder): void {
    this.pageTreeBuilder = builder;
  }
}
