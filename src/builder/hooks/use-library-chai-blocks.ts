import { filter } from "lodash-es";
import { useMemo } from "react";
import { isBlockAvailable } from "~/builder/core/functions/block-helpers";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useRegisteredChaiBlocks } from "~/registry";
import { ChaiBlockConfig } from "~/types/blocks";
import type { ChaiCanShowBlock } from "~/types/chaibuilder-editor-props";

/**
 * Registered core blocks that opted into the Library tab with `showInLibrary`,
 * narrowed to the ones addable on `pageType` and accepted by `canShowBlock`.
 */
export const getLibraryChaiBlocks = <T extends ChaiBlockConfig>(
  chaiBlocks: Record<string, T>,
  pageType: string,
  canShowBlock?: ChaiCanShowBlock,
) =>
  filter(
    chaiBlocks,
    (block) =>
      block.category === "core" &&
      block.showInLibrary === true &&
      block.hidden !== true &&
      isBlockAvailable(block, pageType, canShowBlock),
  );

export const useLibraryChaiBlocks = () => {
  const chaiBlocks = useRegisteredChaiBlocks();
  const { data: currentPage } = usePrimaryPage();
  const canShowBlock = useBuilderProp<ChaiCanShowBlock | undefined>("canShowBlock", undefined);
  const pageType = currentPage?.pageType || "page";
  return useMemo(() => getLibraryChaiBlocks(chaiBlocks, pageType, canShowBlock), [chaiBlocks, pageType, canShowBlock]);
};
