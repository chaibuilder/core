import { useAtomValue } from "jotai";
import { isEmpty } from "lodash-es";
import { useCallback, useMemo } from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { currentBlocksPartialIdsAtom, partialBlocksAtom } from "./atoms";
import { getPartialUsageDepth } from "./utils";

export type PartialGraph = {
  /** partialId -> partial ids it contains (directly or transitively) */
  dependencies: Record<string, string[]>;
  isPartialPage: (id: string) => boolean;
  /** Longest chain of partials above this partial (0 = not nested anywhere) */
  getUsageDepth: (id: string) => number;
};

/**
 * Dependency graph across ALL partials of the site, not just the ones loaded
 * for the current page. Sources, in increasing freshness:
 * 1. Every partial page's saved `partialBlocks` column from the pages list.
 * 2. Live dependencies of partials fetched into the builder this session.
 * 3. The currently edited page's own (possibly unsaved) partial references.
 */
export const usePartialGraph = (): PartialGraph => {
  const { data: pages } = useChaiPrimaryPages();
  const partialBlocks = useAtomValue(partialBlocksAtom);
  // Equality-guarded id list, NOT the raw blocks array: this hook mounts under
  // every canvas block (dnd chain), and a raw presentBlocksAtom subscription
  // here re-rendered every block on every edit (see atoms.ts).
  const currentPartialIds = useAtomValue(currentBlocksPartialIdsAtom);
  const currentPageId = useBuilderProp("pageId", "");

  const partialPageIds = useMemo(() => {
    const ids = new Set<string>();
    (pages ?? []).forEach((page) => {
      if (page?.id && isEmpty(page.slug)) ids.add(page.id as string);
    });
    return ids;
  }, [pages]);

  const dependencies = useMemo(() => {
    const deps: Record<string, string[]> = {};
    (pages ?? []).forEach((page) => {
      if (!page?.id || !isEmpty(page.slug)) return;
      const column = (page as { partialBlocks?: string | null }).partialBlocks ?? "";
      deps[page.id as string] = column ? column.split("|").filter(Boolean) : [];
    });
    Object.entries(partialBlocks).forEach(([id, entry]) => {
      if (entry.status === "loaded") deps[id] = entry.dependencies;
    });
    if (currentPageId && partialPageIds.has(currentPageId)) {
      deps[currentPageId] = currentPartialIds;
    }
    return deps;
  }, [pages, partialBlocks, currentPageId, partialPageIds, currentPartialIds]);

  const isPartialPage = useCallback((id: string) => partialPageIds.has(id), [partialPageIds]);

  const getUsageDepth = useCallback((id: string) => getPartialUsageDepth(id, dependencies), [dependencies]);

  return useMemo(() => ({ dependencies, isPartialPage, getUsageDepth }), [dependencies, isPartialPage, getUsageDepth]);
};
