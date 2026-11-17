import { filter, includes, isEmpty } from "lodash-es";
import { useMemo } from "react";
import { syncChaiBlocksWithDefaultProps } from "~/registry";
import { ChaiBlock } from "~/types/common";

type ExtractedTemplateData = {
  blocks: ChaiBlock[];
};

export const useExtractPageBlocks = (pageBlocks: ChaiBlock[]): ExtractedTemplateData => {
  return useMemo(() => {
    if (!pageBlocks || isEmpty(pageBlocks)) return { blocks: [] };
    const blocks = filter(pageBlocks, (block: ChaiBlock) => !includes(block?._type, "@chai/")) as ChaiBlock[];
    return { blocks: syncChaiBlocksWithDefaultProps(blocks) };
  }, [pageBlocks]);
};
