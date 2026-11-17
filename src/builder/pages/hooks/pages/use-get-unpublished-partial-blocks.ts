import { compact, filter, find, get, isEmpty, uniq } from "lodash-es";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { ChaiBlock } from "~/types/common";

export type PartialBlockStatus = "unpublished" | "unpublished_changes";

export interface PartialBlockInfo {
  id: string;
  name: string;
  status: PartialBlockStatus;
}

// The ids plus every global block they nest: an online header still renders nothing for an offline logo.
export const withNestedPartials = (ids: string[], pages: unknown[]) => {
  const found = new Set(ids);
  const queue = [...ids];
  while (queue.length > 0) {
    const page = find(pages, { id: queue.shift() }) as { partialBlocks?: string | null } | undefined;
    for (const nested of (page?.partialBlocks ?? "").split("|").filter(Boolean)) {
      if (found.has(nested)) continue;
      found.add(nested);
      queue.push(nested);
    }
  }
  return [...found];
};

export const useGetUnpublishedPartialBlocks = () => {
  const { data: websitePages } = useChaiPrimaryPages();

  const getUnpublishedPartialBlocks = useCallback(() => {
    // Guard: return empty if websitePages is not loaded yet
    if (!websitePages) {
      return { ids: [], names: [], partialBlocksInfo: [] };
    }

    // Blocks are read at call time instead of subscribed at render time: this hook feeds
    // the publish flow only, and a live subscription would re-render the topbar on every
    // block commit.
    const blocksStore = builderStore.get(presentBlocksAtom) as ChaiBlock[];
    // Get all blocks with _type === 'PartialBlock'
    const partialBlocks = filter(blocksStore, (block) => block._type === "PartialBlock");
    // Extract unique partialBlockId values
    const partialBlockIds = withNestedPartials(
      uniq(compact(partialBlocks.map((block) => get(block, "partialBlockId", "")))),
      websitePages,
    );
    // Check which ones are unpublished or have unpublished changes
    const partialBlocksInfo: PartialBlockInfo[] = compact(
      partialBlockIds.map((id) => {
        const page = find(websitePages, { id }) as any;
        if (!page) return null;

        // Determine status
        if (!page.online) {
          return {
            id: page.id,
            name: page.name || page.slug || page.id,
            status: "unpublished" as PartialBlockStatus,
          };
        } else if (!isEmpty(page.changes)) {
          return {
            id: page.id,
            name: page.name || page.slug || page.id,
            status: "unpublished_changes" as PartialBlockStatus,
          };
        }
        return null;
      }),
    );

    const ids = partialBlocksInfo.map((info) => info.id);
    const names = partialBlocksInfo.map((info) => info.name);
    return { ids, names, partialBlocksInfo };
  }, [websitePages]);

  return getUnpublishedPartialBlocks;
};
