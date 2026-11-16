import { eq } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { apiError } from "~/server/chai-actions/lib";

/**
 * Interface for page tree node
 */
export interface PageTreeNode {
  id: string;
  pageType: string;
  primaryPage: string | null;
  parent: string | null;
  name: string;
  slug: string;
  dynamic?: boolean;
  deletedAt?: string | null;
  children: PageTreeNode[];
}

/**
 * Interface for page tree result
 */
export interface PageTreeResult {
  primaryTree: PageTreeNode[];
  languageTree: PageTreeNode[];
  totalPrimaryPages: number;
  totalLanguagePages: number;
}

/**
 * Utility class to build page trees from flat page data
 * Supports primary pages, language variants, and partial pages (globals/forms)
 */
export class PageTreeBuilder {
  private appId: string;
  private enableLogging: boolean;

  /**
   * @param appId - Application ID to filter pages
   * @param enableLogging - Enable console logging for debugging (default: false)
   */
  constructor(appId: string, enableLogging: boolean = false) {
    this.appId = appId;
    this.enableLogging = enableLogging;
  }

  /**
   * Fetch and build complete page trees
   * @returns PageTreeResult containing primary and language trees
   */
  async getPagesTree(): Promise<PageTreeResult> {
    // Use Drizzle ORM
    const { data: pages, error } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          name: schema.appPages.name,
          slug: schema.appPages.slug,
          pageType: schema.appPages.pageType,
          primaryPage: schema.appPages.primaryPage,
          parent: schema.appPages.parent,
          lang: schema.appPages.lang,
          dynamic: schema.appPages.dynamic,
          // Carried so slug-conflict validation can skip tombstones (see the
          // hasConflict closure in validateSlugAvailabilityInTree). Trash flows (restore / permanent
          // delete) need soft-deleted pages present in the tree to locate them,
          // so the tree keeps every page and callers decide what to ignore.
          deletedAt: schema.appPages.deletedAt,
        })
        .from(schema.appPages)
        .where(eq(schema.appPages.app, this.appId)),
    );

    if (error) {
      throw apiError("ERROR_GETTING_PAGES", error);
    }

    // Separate primary and language pages
    const primaryPages = pages?.filter((page: any) => page.primaryPage === null) || [];
    const languagePages = pages?.filter((page: any) => page.primaryPage !== null) || [];

    // Build Primary Language Pages Tree
    const primaryTree = this.buildPrimaryTree(primaryPages);
    if (this.enableLogging) {
      console.log("\n=== PRIMARY LANGUAGE PAGES TREE ===");
      console.log(JSON.stringify(primaryTree, null, 2));
    }

    // Build Other Language Pages Tree
    const languageTree = this.buildLanguageTree(languagePages, primaryTree);
    if (this.enableLogging) {
      console.log("\n=== OTHER LANGUAGE PAGES TREE ===");
      console.log(JSON.stringify(languageTree, null, 2));
    }

    return {
      primaryTree,
      languageTree,
      totalPrimaryPages: primaryPages.length,
      totalLanguagePages: languagePages.length,
    };
  }

  /**
   * Build a hierarchical tree structure from primary pages
   * @param pages - Array of primary page objects
   * @returns Array of root PageTreeNode objects
   */
  buildPrimaryTree(pages: any[]): PageTreeNode[] {
    const pageMap = new Map<string, PageTreeNode>();

    // Create nodes for all pages
    pages.forEach((page) => {
      pageMap.set(page.id, {
        id: page.id,
        pageType: page.pageType,
        primaryPage: page.primaryPage,
        parent: page.parent,
        name: page.name,
        dynamic: page.dynamic,
        slug: page.slug,
        deletedAt: page.deletedAt,
        children: [],
      });
    });

    const rootNodes: PageTreeNode[] = [];

    // Build parent-child relationships
    pages.forEach((page) => {
      const node = pageMap.get(page.id);
      if (!node) return;

      if (page.parent === null) {
        // This is a root node
        rootNodes.push(node);
      } else {
        // This is a child node
        const parentNode = pageMap.get(page.parent);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      }
    });

    return rootNodes;
  }

  /**
   * Build a language pages tree based on the primary tree structure
   * @param languagePages - Array of language page objects
   * @param primaryTree - The primary pages tree
   * @returns Array of language page tree nodes
   */
  buildLanguageTree(languagePages: any[], primaryTree: PageTreeNode[]): any[] {
    // Group language pages by their primaryPage
    const languagePagesByPrimary = new Map<string, any[]>();

    languagePages.forEach((langPage) => {
      const primaryId = langPage.primaryPage;
      if (!languagePagesByPrimary.has(primaryId)) {
        languagePagesByPrimary.set(primaryId, []);
      }
      languagePagesByPrimary.get(primaryId)!.push(langPage);
    });

    // Build language tree based on primary tree structure, filtering by language
    const buildLanguageSubtree = (primaryNode: PageTreeNode, lang: string): any => {
      const languagePagesForThisPrimary = languagePagesByPrimary.get(primaryNode.id) || [];

      // Find the language page for this primary node with the specified language
      const langPage = languagePagesForThisPrimary.find((page) => page.lang === lang);

      if (!langPage) {
        return null;
      }

      const langNode: any = {
        id: langPage.id,
        pageType: langPage.pageType,
        primaryPage: langPage.primaryPage,
        parent: langPage.parent,
        lang: langPage.lang,
        name: langPage.name,
        slug: langPage.slug,
        dynamic: langPage.dynamic,
        deletedAt: langPage.deletedAt,
        children: [],
      };

      // For each child in the primary tree, find corresponding language pages with the same language
      primaryNode.children.forEach((primaryChild) => {
        const childLanguageNode = buildLanguageSubtree(primaryChild, lang);
        if (childLanguageNode) {
          langNode.children.push(childLanguageNode);
        }
      });

      return langNode;
    };

    // Build the complete language tree
    const languageTree: any[] = [];

    // Get all unique languages
    const languages = new Set<string>();
    languagePages.forEach((page) => {
      if (page.lang) {
        languages.add(page.lang);
      }
    });

    // Build a separate tree for each language
    languages.forEach((lang) => {
      primaryTree.forEach((primaryRoot) => {
        const languageRootNode = buildLanguageSubtree(primaryRoot, lang);
        if (languageRootNode) {
          languageTree.push(languageRootNode);
        }
      });
    });

    return languageTree;
  }

  /**
   * Find a page in the primary tree by ID
   * @param id - Page ID to search for
   * @param primaryTree - The primary pages tree to search in
   * @returns PageTreeNode if found, null otherwise
   */
  findPageInPrimaryTree(id: string, primaryTree: PageTreeNode[]): PageTreeNode | null {
    for (const node of primaryTree) {
      if (node.id === id) {
        return node;
      }
      // Search in children recursively
      if (node.children && node.children.length > 0) {
        const found = this.findPageInPrimaryTree(id, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Find a page in the language tree by ID
   * @param id - Page ID to search for
   * @param languageTree - The language pages tree to search in
   * @returns Language page node if found, null otherwise
   */
  findPageInLanguageTree(id: string, languageTree: any[]): any | null {
    for (const node of languageTree) {
      if (node.id === id) {
        return node;
      }
      // Search in children recursively
      if (node.children && node.children.length > 0) {
        const found = this.findPageInLanguageTree(id, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Calculate new slug based on parent path
   * @param newParentId - New parent page ID (null for root level)
   * @param currentSlug - Current slug of the page
   * @param primaryTree - The primary pages tree
   * @returns New slug based on parent path
   */
  calculateSlugFromParent(newParentId: string | null, currentSlug: string, primaryTree: PageTreeNode[]): string {
    if (!newParentId) {
      // Moving to root level - extract just the last segment
      const segments = currentSlug.split("/").filter(Boolean);
      return "/" + (segments[segments.length - 1] || "");
    }

    // Find the new parent in the tree
    let parentNode = this.findPageInPrimaryTree(newParentId, primaryTree);
    if (!parentNode) {
      parentNode = this.findPageInLanguageTree(newParentId, primaryTree);
      if (!parentNode) {
        throw new Error("Parent page not found in tree");
      }
    }

    // Get the last segment of current slug (the page's own slug part)
    const segments = currentSlug.split("/").filter(Boolean);
    const ownSlugSegment = segments[segments.length - 1] || "";

    // Combine parent slug with own segment
    const parentSlug = parentNode.slug.endsWith("/") ? parentNode.slug.slice(0, -1) : parentNode.slug;
    return `${parentSlug}/${ownSlugSegment}`;
  }

  /**
   * Collect all nested child IDs from a tree node
   * @param node - The node to collect children from
   * @returns Array of child IDs
   */
  collectNestedChildIds(node: PageTreeNode): string[] {
    const ids: string[] = [];

    for (const child of node.children) {
      ids.push(child.id);
      // Recursively collect from nested children
      const nestedIds = this.collectNestedChildIds(child);
      ids.push(...nestedIds);
    }

    return ids;
  }

  /**
   * Find all language pages for a given primary page ID
   * @param primaryPageId - Primary page ID to find variants for
   * @param languageTree - The language pages tree to search in
   * @returns Array of language page nodes
   */
  findLanguagePagesForPrimary(primaryPageId: string, languageTree: any[]): any[] {
    const results: any[] = [];

    const searchTree = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.primaryPage === primaryPageId) {
          results.push(node);
        }
        // Recursively search children
        if (node.children && node.children.length > 0) {
          searchTree(node.children);
        }
      }
    };

    searchTree(languageTree);
    return results;
  }

  /**
   * Collect all nested children with their IDs and slugs for slug updates
   * @param node - The node to collect children from
   * @param oldParentSlug - The old parent slug to replace
   * @param newParentSlug - The new parent slug
   * @returns Array of objects with id, oldSlug, and newSlug
   */
  collectNestedChildSlugs(
    node: PageTreeNode,
    oldParentSlug: string,
    newParentSlug: string,
  ): Array<{ id: string; oldSlug: string; newSlug: string }> {
    const slugUpdates: Array<{ id: string; oldSlug: string; newSlug: string }> = [];

    const processChildren = (children: PageTreeNode[], parentOldSlug: string, parentNewSlug: string) => {
      for (const child of children) {
        const newChildSlug = this.generateNewChildSlug(child.slug, parentOldSlug, parentNewSlug);

        slugUpdates.push({
          id: child.id,
          oldSlug: child.slug,
          newSlug: newChildSlug,
        });

        // Recursively process nested children
        if (child.children && child.children.length > 0) {
          processChildren(child.children, child.slug, newChildSlug);
        }
      }
    };

    processChildren(node.children, oldParentSlug, newParentSlug);
    return slugUpdates;
  }

  /**
   * Generate new slug for child page based on parent slug change
   * @param currentChildSlug - Current child slug
   * @param oldParentSlug - Old parent slug
   * @param newParentSlug - New parent slug
   * @returns New child slug
   */
  private generateNewChildSlug(currentChildSlug: string, oldParentSlug: string, newParentSlug: string): string {
    // Dynamic page - child slug is same as parent
    if (currentChildSlug === oldParentSlug) {
      return newParentSlug;
    }

    // A "/" parent contributes no path segment — joining it verbatim would
    // produce double-slash children like "//team" when a page is promoted to
    // the homepage.
    const parentPrefix = newParentSlug === "/" ? "" : newParentSlug;

    // Likewise a "/" OLD parent contributed no segment: its children look like
    // "/team", so prefix-replacement against "/" would eat their leading slash
    // ("/team" -> "hometeam"). Prepend the new parent instead.
    if (oldParentSlug === "/") {
      return `${parentPrefix}${currentChildSlug}`;
    }

    // If child slug starts with old parent slug + "/", replace it
    if (currentChildSlug.startsWith(oldParentSlug + "/")) {
      return currentChildSlug.replace(oldParentSlug + "/", parentPrefix + "/");
    }

    // If child slug starts with old parent slug (without trailing slash)
    if (currentChildSlug.startsWith(oldParentSlug) && currentChildSlug !== oldParentSlug) {
      return currentChildSlug.replace(oldParentSlug, parentPrefix);
    }

    // For other cases, construct new slug by replacing the parent part
    return `${parentPrefix}/${currentChildSlug.split("/").pop()}`;
  }
}
