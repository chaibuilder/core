import { compact, filter, includes, isEmpty, keyBy, mapValues, startCase, toLower, uniqBy } from "lodash-es";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";

// Define the ChaiPage interface
export interface ChaiPage {
  id: string;
  name: string;
  slug: string;
  pageType: string;
  parent: string | null;
  children?: ChaiPage[];
  isTemplate?: boolean;
  dynamic?: boolean;
  /** The page this one renders while `useUpstream` is on (upstream pages). */
  upstream?: string | null;
  useUpstream?: boolean;
  canDuplicate?: boolean;
  [key: string]: any;
}

export interface PageNode extends ChaiPage {
  children: PageNode[];
  pageType: string;
  name: string;
  parent: string | null;
  slug: string;
}

export const filterPagesBySearch = (pages: ChaiPage[], search: string): ChaiPage[] => {
  if (!pages || !Array.isArray(pages)) return [];
  if (isEmpty(search)) return pages;
  return compact(
    filter(pages, (page) => {
      const searchTerm = toLower(search);
      return includes(toLower(page?.name || ""), searchTerm) || includes(toLower(page?.slug || ""), searchTerm);
    }),
  );
};
// Keep only pages carrying ANY of the selected tags (case-insensitive, OR semantics).
// Tags live in metadata under the namespaced PARTIAL_TAGS_METADATA_KEY (`__tags`).
export const filterPagesByTags = (pages: ChaiPage[], selectedTags: string[]): ChaiPage[] => {
  if (!pages || !Array.isArray(pages)) return [];
  if (isEmpty(selectedTags)) return pages;
  // Plain toLowerCase for exact case-insensitive matching — matches server-side
  // normalizeTags and the UI comparisons (lodash toLower would over-normalize).
  const selected = new Set(selectedTags.map((t) => t.toLowerCase()));
  return filter(pages, (page) => {
    const tags = page?.metadata?.[PARTIAL_TAGS_METADATA_KEY];
    return Array.isArray(tags) && tags.some((t) => typeof t === "string" && selected.has(t.toLowerCase()));
  });
};
// Returns all parent pages for the given matching children, traversing recursively.
export const findParentPages = (pages: ChaiPage[], matchingPages: ChaiPage[]): ChaiPage[] => {
  const parentIds = new Set<string>();
  const allPages = keyBy(pages, "id");

  // Find all parent IDs of matching pages
  matchingPages.forEach((page) => {
    let currentPage = page;
    while (currentPage.parent && allPages[currentPage.parent]) {
      parentIds.add(currentPage.parent);
      currentPage = allPages[currentPage.parent];
    }
  });

  // Return all parent pages
  return Array.from(parentIds).map((id) => allPages[id]);
};
// Recursively marks pages that should be expanded during search
export const markPagesForExpansion = (
  pages: PageNode[],
  search: string,
  hasSlug: (pageType: string) => boolean,
): PageNode[] => {
  if (isEmpty(search)) return pages;
  return pages.map((page) => {
    // If this is a wrapper (category) for pages without a slug
    if (!hasSlug(page.pageType)) {
      return {
        ...page,
        shouldExpandOnSearch: true,
        children: page.children ? markPagesForExpansion(page.children, search, hasSlug) : [],
      };
    }
    const hasMatchingChildren =
      page.children &&
      page.children.some(
        (child) =>
          includes(toLower(child.name || ""), toLower(search)) || includes(toLower(child.slug || ""), toLower(search)),
      );
    return {
      ...page,
      shouldExpandOnSearch: hasMatchingChildren,
      children: page.children ? markPagesForExpansion(page.children, search, hasSlug) : [],
    };
  });
};

export const buildPageTree = (pages: ChaiPage[]): PageNode[] => {
  if (!pages || !pages.length) return [];

  // Create a map of pages by their id for easy lookup
  const pageMap: Record<string, PageNode> = {};
  pages.forEach((page) => {
    pageMap[page.id] = { ...page, children: [] };
  });
  const rootPages: PageNode[] = [];

  // First pass: Assign children to their parents
  Object.values(pageMap).forEach((page) => {
    if (page.parent && pageMap[page.parent]) {
      pageMap[page.parent].children.push(page);
    } else {
      rootPages.push(page);
    }
  });

  return rootPages;
};

export const sortPageTree = (pages: PageNode[]): PageNode[] => {
  if (!pages || !pages.length) return [];

  const sortedPages = [...pages].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return sortedPages.map((page) => ({
    ...page,
    children: page.children ? sortPageTree(page.children) : [],
  }));
};

export const organizePages = (
  allPages: ChaiPage[],
  search: string,
  selectedPageType: string,
  hasSlug: (pageType: string) => boolean,
  selectedTags: string[] = [],
): ChaiPage[] => {
  if (!allPages || !allPages.length) return [];

  // If a specific page type is selected, filter by page type first
  let filteredPages = allPages;
  if (selectedPageType !== "all") {
    filteredPages = compact(filter(allPages, { pageType: selectedPageType }));
  }

  // Tag filter: keep tagged matches plus their parents so nested pages still render.
  if (!isEmpty(selectedTags)) {
    const matching = filterPagesByTags(filteredPages, selectedTags);
    const parentPages = findParentPages(allPages, matching);
    filteredPages = uniqBy([...matching, ...parentPages], "id");
  }

  // If searching, include parent pages of matching children
  if (!isEmpty(search)) {
    const matchingPages = filterPagesBySearch(filteredPages, search);
    const parentPages = findParentPages(allPages, matchingPages);

    // Combine matching pages with their parent pages, removing duplicates
    filteredPages = uniqBy([...matchingPages, ...parentPages], "id");
  } else {
    // If not searching, use the original filtered pages
    filteredPages = filterPagesBySearch(filteredPages, search);
  }

  // Build and sort the page tree
  const pageTree = sortPageTree(buildPageTree(filteredPages));

  // Mark pages for expansion during search
  const markedPageTree = markPagesForExpansion(pageTree, search, hasSlug);

  // Separate pages with and without slugs
  const pagesWithSlug = filter(markedPageTree, (page) => hasSlug(page.pageType)).sort((a, b) =>
    (a.name || "").localeCompare(b.name || ""),
  );
  // Group partial blocks by pageType and collect them in an array
  const partialPages = filter(markedPageTree, (page) => !hasSlug(page.pageType));

  let partialBlocks: PageNode[] = [];

  if (selectedPageType === "all") {
    // Group partial blocks by pageType when showing all page types
    const partialBlocksByType = keyBy(partialPages, "pageType");

    if (Object.keys(partialBlocksByType).length > 1) {
      partialBlocks = Object.values(
        mapValues(partialBlocksByType, (page, pageType) => ({
          ...page,
          id: pageType,
          name: startCase(pageType),
          isPartialGroup: true,
          children: markedPageTree.filter((p) => p.pageType === pageType),
        })),
      ).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      // Don't group when only one partial type is present or no partials
      partialBlocks = partialPages.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
  } else {
    // Don't group when a specific page type is selected - return individual partials
    partialBlocks = partialPages.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  return [...pagesWithSlug, ...partialBlocks];
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("filterPagesBySearch", () => {
    const mockPages: ChaiPage[] = [
      { id: "1", name: "Home Page", slug: "home", pageType: "page", parent: null },
      { id: "2", name: "About Us", slug: "about", pageType: "page", parent: null },
      { id: "3", name: "Contact", slug: "contact-us", pageType: "page", parent: null },
    ];

    it("should return all pages when search is empty", () => {
      const result = filterPagesBySearch(mockPages, "");
      expect(result).toEqual(mockPages);
    });

    it("should filter pages by name (case-insensitive)", () => {
      const result = filterPagesBySearch(mockPages, "home");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Home Page");
    });

    it("should filter pages by slug (case-insensitive)", () => {
      const result = filterPagesBySearch(mockPages, "contact");
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("contact-us");
    });

    it("should return empty array for non-matching search", () => {
      const result = filterPagesBySearch(mockPages, "nonexistent");
      expect(result).toEqual([]);
    });

    it("should handle null or undefined pages array", () => {
      expect(filterPagesBySearch(null as any, "test")).toEqual([]);
      expect(filterPagesBySearch(undefined as any, "test")).toEqual([]);
    });

    it("should handle partial matches", () => {
      const result = filterPagesBySearch(mockPages, "abo");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("About Us");
    });
  });

  describe("filterPagesByTags", () => {
    const taggedPages: ChaiPage[] = [
      { id: "1", name: "Home", slug: "home", pageType: "page", parent: null, metadata: { __tags: ["Hero", "CTA"] } },
      { id: "2", name: "About", slug: "about", pageType: "page", parent: null, metadata: { __tags: ["FAQ"] } },
      { id: "3", name: "Contact", slug: "contact", pageType: "page", parent: null, metadata: {} },
      { id: "4", name: "Blog", slug: "blog", pageType: "page", parent: null },
    ];

    it("returns all pages when no tags selected", () => {
      expect(filterPagesByTags(taggedPages, [])).toEqual(taggedPages);
    });

    it("matches pages carrying any selected tag (case-insensitive)", () => {
      const result = filterPagesByTags(taggedPages, ["cta"]);
      expect(result.map((p) => p.id)).toEqual(["1"]);
    });

    it("uses OR semantics across multiple tags", () => {
      const result = filterPagesByTags(taggedPages, ["CTA", "FAQ"]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("excludes pages without matching or missing tags", () => {
      const result = filterPagesByTags(taggedPages, ["Nope"]);
      expect(result).toEqual([]);
    });

    it("handles null pages array", () => {
      expect(filterPagesByTags(null as any, ["x"])).toEqual([]);
    });
  });

  describe("organizePages with tags", () => {
    const hasSlug = (pageType: string) => pageType === "page";
    const pages: ChaiPage[] = [
      { id: "1", name: "Home", slug: "home", pageType: "page", parent: null, metadata: { __tags: ["Hero"] } },
      { id: "2", name: "About", slug: "about", pageType: "page", parent: null, metadata: { __tags: ["FAQ"] } },
    ];

    it("filters pages by selected tags", () => {
      const result = organizePages(pages, "", "all", hasSlug, ["Hero"]);
      expect(result.map((p) => p.id)).toEqual(["1"]);
    });

    it("returns all pages when no tags selected", () => {
      const result = organizePages(pages, "", "all", hasSlug, []);
      expect(result.length).toBe(2);
    });
  });

  describe("findParentPages", () => {
    const mockPages: ChaiPage[] = [
      { id: "1", name: "Root", slug: "root", pageType: "page", parent: null },
      { id: "2", name: "Parent", slug: "parent", pageType: "page", parent: "1" },
      { id: "3", name: "Child", slug: "child", pageType: "page", parent: "2" },
      { id: "4", name: "Grandchild", slug: "grandchild", pageType: "page", parent: "3" },
    ];

    it("should find all parent pages for a given child", () => {
      const matchingPages = [mockPages[3]]; // Grandchild
      const result = findParentPages(mockPages, matchingPages);
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toContain("1");
      expect(result.map((p) => p.id)).toContain("2");
      expect(result.map((p) => p.id)).toContain("3");
    });

    it("should return empty array when matching page has no parent", () => {
      const matchingPages = [mockPages[0]]; // Root
      const result = findParentPages(mockPages, matchingPages);
      expect(result).toEqual([]);
    });

    it("should handle multiple matching pages", () => {
      const matchingPages = [mockPages[2], mockPages[3]]; // Child and Grandchild
      const result = findParentPages(mockPages, matchingPages);
      expect(result.length).toBeGreaterThan(0);
      expect(result.map((p) => p.id)).toContain("1");
      expect(result.map((p) => p.id)).toContain("2");
    });

    it("should handle empty matching pages array", () => {
      const result = findParentPages(mockPages, []);
      expect(result).toEqual([]);
    });
  });

  describe("buildPageTree", () => {
    it("should build a tree structure from flat pages", () => {
      const mockPages: ChaiPage[] = [
        { id: "1", name: "Root", slug: "root", pageType: "page", parent: null },
        { id: "2", name: "Child1", slug: "child1", pageType: "page", parent: "1" },
        { id: "3", name: "Child2", slug: "child2", pageType: "page", parent: "1" },
      ];

      const result = buildPageTree(mockPages);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(result[0].children).toHaveLength(2);
    });

    it("should handle multiple root pages", () => {
      const mockPages: ChaiPage[] = [
        { id: "1", name: "Root1", slug: "root1", pageType: "page", parent: null },
        { id: "2", name: "Root2", slug: "root2", pageType: "page", parent: null },
      ];

      const result = buildPageTree(mockPages);
      expect(result).toHaveLength(2);
    });

    it("should handle empty pages array", () => {
      const result = buildPageTree([]);
      expect(result).toEqual([]);
    });

    it("should handle null or undefined pages", () => {
      expect(buildPageTree(null as any)).toEqual([]);
      expect(buildPageTree(undefined as any)).toEqual([]);
    });

    it("should handle nested children", () => {
      const mockPages: ChaiPage[] = [
        { id: "1", name: "Root", slug: "root", pageType: "page", parent: null },
        { id: "2", name: "Child", slug: "child", pageType: "page", parent: "1" },
        { id: "3", name: "Grandchild", slug: "grandchild", pageType: "page", parent: "2" },
      ];

      const result = buildPageTree(mockPages);
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].children).toHaveLength(1);
    });
  });

  describe("sortPageTree", () => {
    it("should sort pages alphabetically by name", () => {
      const mockPages: PageNode[] = [
        { id: "1", name: "Zebra", slug: "zebra", pageType: "page", parent: null, children: [] },
        { id: "2", name: "Apple", slug: "apple", pageType: "page", parent: null, children: [] },
        { id: "3", name: "Banana", slug: "banana", pageType: "page", parent: null, children: [] },
      ];

      const result = sortPageTree(mockPages);
      expect(result[0].name).toBe("Apple");
      expect(result[1].name).toBe("Banana");
      expect(result[2].name).toBe("Zebra");
    });

    it("should recursively sort children", () => {
      const mockPages: PageNode[] = [
        {
          id: "1",
          name: "Parent",
          slug: "parent",
          pageType: "page",
          parent: null,
          children: [
            { id: "2", name: "Zebra", slug: "zebra", pageType: "page", parent: "1", children: [] },
            { id: "3", name: "Apple", slug: "apple", pageType: "page", parent: "1", children: [] },
          ],
        },
      ];

      const result = sortPageTree(mockPages);
      expect(result[0].children[0].name).toBe("Apple");
      expect(result[0].children[1].name).toBe("Zebra");
    });

    it("should handle empty pages array", () => {
      const result = sortPageTree([]);
      expect(result).toEqual([]);
    });

    it("should handle null or undefined pages", () => {
      expect(sortPageTree(null as any)).toEqual([]);
      expect(sortPageTree(undefined as any)).toEqual([]);
    });
  });

  describe("markPagesForExpansion", () => {
    const hasSlug = (pageType: string) => pageType === "page";

    it("should return pages unchanged when search is empty", () => {
      const mockPages: PageNode[] = [
        { id: "1", name: "Page", slug: "page", pageType: "page", parent: null, children: [] },
      ];

      const result = markPagesForExpansion(mockPages, "", hasSlug);
      expect(result).toEqual(mockPages);
    });

    it("should mark pages with matching children for expansion", () => {
      const mockPages: PageNode[] = [
        {
          id: "1",
          name: "Parent",
          slug: "parent",
          pageType: "page",
          parent: null,
          children: [
            { id: "2", name: "Matching Child", slug: "matching", pageType: "page", parent: "1", children: [] },
          ],
        },
      ];

      const result = markPagesForExpansion(mockPages, "matching", hasSlug);
      expect(result[0].shouldExpandOnSearch).toBe(true);
    });

    it("should not mark pages without matching children", () => {
      const mockPages: PageNode[] = [
        {
          id: "1",
          name: "Parent",
          slug: "parent",
          pageType: "page",
          parent: null,
          children: [{ id: "2", name: "Child", slug: "child", pageType: "page", parent: "1", children: [] }],
        },
      ];

      const result = markPagesForExpansion(mockPages, "nonexistent", hasSlug);
      expect(result[0].shouldExpandOnSearch).toBe(false);
    });

    it("should always mark wrapper pages (without slug) for expansion", () => {
      const mockPages: PageNode[] = [
        { id: "1", name: "Wrapper", slug: "wrapper", pageType: "partial", parent: null, children: [] },
      ];

      const result = markPagesForExpansion(mockPages, "test", hasSlug);
      expect(result[0].shouldExpandOnSearch).toBe(true);
    });

    it("should not recursively mark nested children", () => {
      const mockPages: PageNode[] = [
        {
          id: "1",
          name: "Root",
          slug: "root",
          pageType: "page",
          parent: null,
          children: [
            {
              id: "2",
              name: "Matching Parent",
              slug: "matching-parent",
              pageType: "page",
              parent: "1",
              children: [{ id: "3", name: "Child", slug: "child", pageType: "page", parent: "2", children: [] }],
            },
          ],
        },
      ];

      const result = markPagesForExpansion(mockPages, "matching", hasSlug);
      expect(result[0].shouldExpandOnSearch).toBe(true);
      expect(result[0].children[0].shouldExpandOnSearch).toBe(false);
    });
  });

  describe("organizePages", () => {
    const hasSlug = (pageType: string) => pageType === "page";

    const mockPages: ChaiPage[] = [
      { id: "1", name: "Home", slug: "home", pageType: "page", parent: null },
      { id: "2", name: "About", slug: "about", pageType: "page", parent: null },
      { id: "3", name: "Header", slug: "header", pageType: "partial", parent: null },
      { id: "4", name: "Footer", slug: "footer", pageType: "partial", parent: null },
    ];

    it("should return empty array for empty pages", () => {
      const result = organizePages([], "", "all", hasSlug);
      expect(result).toEqual([]);
    });

    it("should organize pages with all page types", () => {
      const result = organizePages(mockPages, "", "all", hasSlug);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by specific page type", () => {
      const result = organizePages(mockPages, "", "page", hasSlug);
      const pageTypes = result.map((p) => p.pageType);
      expect(pageTypes.every((type) => type === "page")).toBe(true);
    });

    it("should include parent pages when searching", () => {
      const pagesWithHierarchy: ChaiPage[] = [
        { id: "1", name: "Parent", slug: "parent", pageType: "page", parent: null },
        { id: "2", name: "Child", slug: "child", pageType: "page", parent: "1" },
      ];

      const result = organizePages(pagesWithHierarchy, "child", "all", hasSlug);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should separate pages with and without slugs", () => {
      const result = organizePages(mockPages, "", "all", hasSlug);
      const pagesWithSlug = result.filter((p) => hasSlug(p.pageType));
      const pagesWithoutSlug = result.filter((p) => !hasSlug(p.pageType));
      expect(pagesWithSlug.length).toBeGreaterThan(0);
      expect(pagesWithoutSlug.length).toBeGreaterThan(0);
    });

    it("should NOT group partial blocks by pageType when there is only one", () => {
      const result = organizePages(mockPages, "", "all", hasSlug);
      const hasPartialGroup = result.some((p) => (p as any).isPartialGroup);
      expect(hasPartialGroup).toBe(false);
    });

    it("should group partial blocks by pageType when there are multiple", () => {
      const multiTypePages = [
        ...mockPages,
        { id: "5", name: "Sidebar", slug: "sidebar", pageType: "sidebar", parent: null },
      ];
      const result = organizePages(multiTypePages, "", "all", hasSlug);
      const partialGroups = result.filter((p) => (p as any).isPartialGroup);
      expect(partialGroups.length).toBeGreaterThan(0);
    });

    it("should not group partials when specific page type is selected", () => {
      const result = organizePages(mockPages, "", "partial", hasSlug);
      const hasPartialGroup = result.some((p) => (p as any).isPartialGroup);
      expect(hasPartialGroup).toBe(false);
    });

    it("should handle null or undefined pages", () => {
      expect(organizePages(null as any, "", "all", hasSlug)).toEqual([]);
      expect(organizePages(undefined as any, "", "all", hasSlug)).toEqual([]);
    });
  });
}
