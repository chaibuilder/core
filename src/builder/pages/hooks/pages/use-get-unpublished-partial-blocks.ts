import { compact, filter, find, get, isEmpty, uniq } from "lodash-es";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { ChaiBlock } from "~/types/common";

export type PartialBlockStatus = "unpublished" | "unpublished_changes";

export interface PartialBlockInfo {
  id: string;
  name: string;
  status: PartialBlockStatus;
}

export const useGetUnpublishedPartialBlocks = () => {
  const { data: websitePages } = useWebsitePrimaryPages();

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
    const partialBlockIds = uniq(compact(partialBlocks.map((block) => get(block, "partialBlockId", ""))));
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
