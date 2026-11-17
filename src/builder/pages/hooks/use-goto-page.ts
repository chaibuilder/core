import { useCallback } from "react";
import { updateBlockIdInUrl } from "~/builder/hooks/use-block-selection-query-sync";
import { useIsPublishing } from "./pages/mutations";
import { useChangePage } from "./use-change-page";

export const useChaiGotoPage = () => {
  const changePage = useChangePage();
  const isPublishing = useIsPublishing();
  return useCallback(
    ({ pageId, blockId }: { pageId: string; lang?: string; blockId?: string }) => {
      // Publishing saves the current page first, so swapping the page out from
      // under it would save and publish the wrong blocks.
      if (isPublishing) return;
      changePage(pageId);
      // Carry the target block id in the URL (?bid=) so it is auto-selected
      // once the destination page's blocks finish loading. changePage rebuilds
      // the query string from scratch, so this must run after it.
      updateBlockIdInUrl(blockId ?? null);
    },
    [changePage, isPublishing],
  );
};
