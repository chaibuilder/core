import { atom, useSetAtom } from "jotai";
import { filter, first, get as getProp, map } from "lodash-es";
import { useCallback } from "react";
import { twMerge } from "cnfast";
import { pageBlocksAtomsAtom } from "~/builder/atoms/blocks";
import { orderClassesByBreakpoint } from "~/builder/core/functions/order-classes-by-breakpoint";
import { removeDuplicateClasses } from "~/builder/core/functions/remove-duplicate-classes";
import { getSplitChaiClasses } from "~/builder/hooks/get-split-classes";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { selectedStylingBlocksAtom, TStyleBlock } from "~/builder/hooks/use-selected-styling-blocks";
import { STYLES_KEY } from "~/constants/STRINGS";
import { ChaiBlock } from "~/types/common";
import { dropReplacedLayoutTokens } from "~/utils/layout-tokens";

type Created = {
  blockIds: Array<string>;
  newClasses: Array<string>;
};

/**
 * Core Styling function
 * @param blockIds
 * @param newClasses
 */
export const addClassesToBlocksAtom = atom(null, (get, _set, { blockIds, newClasses }: Created) => {
  const blockAtoms = filter(get(pageBlocksAtomsAtom), (blockAtom) => blockIds.includes(get(blockAtom)._id));
  const styleBlock = first(get(selectedStylingBlocksAtom)) as TStyleBlock;
  return map(blockAtoms, (blockAtom) => {
    const block: ChaiBlock = get(blockAtom as any);
    const classesString: string = getProp(block, styleBlock.prop, `${STYLES_KEY},`);
    const { classes } = getSplitChaiClasses(classesString);
    return {
      ids: [block._id],
      props: {
        [styleBlock.prop]: `${STYLES_KEY},${orderClassesByBreakpoint(
          removeDuplicateClasses(twMerge(dropReplacedLayoutTokens(classes, newClasses), newClasses)),
        )}`,
      },
    };
  });
});

export const useAddClassesToBlocks = () => {
  const addClassesToBlocks = useSetAtom(addClassesToBlocksAtom);
  const { updateBlocks, updateBlocksRuntime } = useBlocksStoreUndoableActions();
  return useCallback(
    (blockIds: Array<string>, newClasses: Array<string>, undo: boolean = false) => {
      const blocks = addClassesToBlocks({ blockIds, newClasses }) as Array<{
        ids: Array<string>;
        props: any;
      }>;
      if (!undo) {
        updateBlocksRuntime(blockIds, blocks[0].props);
        return;
      }
      updateBlocks(blockIds, blocks[0].props);
    },
    [addClassesToBlocks, updateBlocks, updateBlocksRuntime],
  );
};
