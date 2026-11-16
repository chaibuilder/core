import { chunk, forEach, get, includes, isEmpty, isString, keys, omit, set, unset } from "lodash-es";
import { useCallback } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useLanguages } from "~/builder/hooks/use-languages";
import { selectedBlockAtom } from "~/builder/hooks/use-selected-blockIds";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types/common";

const updatePropsForLanguage = (props: Record<string, any>, selectedLang: string, selectedBlock?: ChaiBlock) => {
  const chaiBlock = getRegisteredChaiBlock(get(selectedBlock, "_type", ""));
  if (!chaiBlock) return props;

  const updatedProps = { ...props };
  forEach(keys(props), (key) => {
    if (includes(get(chaiBlock, "i18nProps", []), key) && !isEmpty(selectedLang)) {
      const _key = `${key}-${selectedLang}`;
      set(updatedProps, _key, props[key]);
      unset(updatedProps, key);
    }
  });
  return updatedProps;
};

/**
 *
 */
export const useUpdateBlocksProps = () => {
  const { updateBlocks } = useBlocksStoreUndoableActions();
  const { selectedLang } = useLanguages();

  return useCallback(
    (blockIds: Array<string>, props: Record<string, any>, prevPropsState?: Record<string, any>) => {
      // PERF: read on-demand — subscribing to the selected block value would
      // re-render every consumer of this hook on each edit of that block
      const selectedBlock = builderStore.get(selectedBlockAtom);
      const updatedProps = updatePropsForLanguage(props, selectedLang, selectedBlock);
      const updatedPrevPropsState = prevPropsState
        ? updatePropsForLanguage(prevPropsState, selectedLang, selectedBlock)
        : undefined;
      updateBlocks(blockIds, updatedProps, updatedPrevPropsState);
    },
    [selectedLang, updateBlocks],
  );
};

export const useUpdateMultipleBlocksProps = () => {
  const { updateMultipleBlocksProps } = useBlocksStoreUndoableActions();
  return useCallback(
    (blocks: Array<{ _id: string } & Partial<ChaiBlock>>) => {
      updateMultipleBlocksProps(blocks);
    },
    [updateMultipleBlocksProps],
  );
};

/**
 *
 */
const useFakeStreamEffect = () => {
  const { updateBlocksRuntime } = useBlocksStoreUndoableActions();
  return useCallback(
    async (id: string, block: Partial<ChaiBlock>, delay = 30) => {
      const props = keys(omit(block, ["_id"]));
      for (const prop of props) {
        const value = block[prop];
        if (isString(value)) {
          const letters = chunk(value.split(""), 12);
          let str = "";
          updateBlocksRuntime([id], { [prop]: "" });
          for (let i = 0; i < letters.length; i++) {
            str += letters[i].join("");
            updateBlocksRuntime([id], { [prop]: str });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    },
    [updateBlocksRuntime],
  );
};

export const useStreamMultipleBlocksProps = () => {
  const { updateMultipleBlocksProps } = useBlocksStoreUndoableActions();
  const streamEffect = useFakeStreamEffect();
  return useCallback(
    async (blocks: Array<{ _id: string } & Partial<ChaiBlock>>) => {
      // Streaming mutates the live block state without history. Capture the
      // original values before the first streamed character so the completed
      // AI response can be committed as one atomic undo/redo command.
      const currentBlocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
      const blocksById = new Map(currentBlocks.map((block) => [block._id, block]));
      const previousPropsState = blocks.map((block) => {
        const currentBlock = blocksById.get(block._id);
        const previousProps: Record<string, any> = { _id: block._id };
        forEach(keys(omit(block, ["_id"])), (key) => {
          previousProps[key] = currentBlock?.[key];
        });
        return previousProps as { _id: string } & Partial<ChaiBlock>;
      });

      for (const block of blocks) {
        await streamEffect(block._id, block);
      }
      updateMultipleBlocksProps(blocks, previousPropsState);
    },
    [streamEffect, updateMultipleBlocksProps],
  );
};

export const useUpdateBlocksPropsRealtime = () => {
  const { updateBlocksRuntime } = useBlocksStoreUndoableActions();
  const { selectedLang } = useLanguages();

  return useCallback(
    (blockIds: Array<string>, props: Record<string, any>) => {
      // PERF: read on-demand — subscribing to the selected block value would
      // re-render every consumer of this hook on each edit of that block
      const selectedBlock = builderStore.get(selectedBlockAtom);
      const updatedProps = updatePropsForLanguage(props, selectedLang, selectedBlock);
      updateBlocksRuntime(blockIds, updatedProps);
    },
    [selectedLang, updateBlocksRuntime],
  );
};
