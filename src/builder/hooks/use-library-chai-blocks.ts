import { filter } from "lodash-es";
import { useMemo } from "react";
import { isBlockAvailableForPageType } from "~/builder/core/functions/block-helpers";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useRegisteredChaiBlocks } from "~/registry";
import { ChaiBlockConfig } from "~/types/blocks";

/**
 * Registered core blocks that opted into the Library tab with `showInLibrary`,
 * narrowed to the ones addable on `pageType`.
 */
export const getLibraryChaiBlocks = <T extends ChaiBlockConfig>(chaiBlocks: Record<string, T>, pageType: string) =>
  filter(
    chaiBlocks,
    (block) =>
      block.category === "core" &&
      block.showInLibrary === true &&
      block.hidden !== true &&
      isBlockAvailableForPageType(block, pageType),
  );

export const useLibraryChaiBlocks = () => {
  const chaiBlocks = useRegisteredChaiBlocks();
  const { data: currentPage } = usePrimaryPage();
  const pageType = currentPage?.pageType || "page";
  return useMemo(() => getLibraryChaiBlocks(chaiBlocks, pageType), [chaiBlocks, pageType]);
};
