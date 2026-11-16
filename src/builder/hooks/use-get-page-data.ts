import { compact, get, map, memoize, omit } from "lodash-es";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useCurrentPage } from "~/builder/hooks/use-current-page";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types/common";

/**
 * Get the builder props for a block
 * @param type - The type of the block
 * @returns The builder props for the block
 */
const getBlockBuilderProps = memoize((type: string) => {
  const registeredBlock = getRegisteredChaiBlock(type);
  const props = get(registeredBlock, "schema.properties", {}) as Record<string, unknown>;
  return compact(
    Object.keys(props).map((key) => {
      return get(props[key], "builderProp", false) || get(props[key], "runtime", false) ? key : null;
    }),
  );
});

export const useGetPageData = () => {
  const { currentPage } = useCurrentPage();

  return useCallback(() => {
    // Blocks are read at call time instead of subscribed at render time: they are only
    // consumed inside this callback, and a live subscription would re-render every
    // useSavePage consumer on each store commit.
    const presentBlocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
    // omit the builder props from the blocks as they are not needed for the page data
    // and only used inside the builder
    const blocks = map<ChaiBlock>(presentBlocks, (block: ChaiBlock) => {
      return omit(block, getBlockBuilderProps(block._type));
    }) as unknown as ChaiBlock[];
    return {
      currentPage,
      blocks,
    };
  }, [currentPage]);
};
