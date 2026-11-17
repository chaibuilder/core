import { atom, useAtom } from "jotai";
import {
  cloneDeep,
  compact,
  filter,
  find,
  flattenDeep,
  get,
  has,
  isEmpty,
  isString,
  noop,
  pick,
  startsWith,
} from "lodash-es";
import { useCallback, useState } from "react";
import { getSplitChaiClasses } from "~/builder/hooks/get-split-classes";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useRightPanel } from "~/builder/hooks/use-theme";
import { useStreamMultipleBlocksProps, useUpdateMultipleBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";
import { STYLES_KEY } from "~/constants/STRINGS";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiAskAiResult } from "~/types/chaibuilder-editor-props";
import { ChaiBlock } from "~/types/common";

function getChildBlocks(allBlocks: ChaiBlock[], blockId: string, blocks: ChaiBlock[]) {
  blocks.push(find(allBlocks, { _id: blockId }) as ChaiBlock);
  const children = filter(allBlocks, { _parent: blockId });
  for (const child of children) {
    blocks.push(...getBlockWithChildren(child._id, allBlocks));
  }
  return blocks;
}

const getBlockWithChildren = (blockId: string, allBlocks: ChaiBlock[]) => {
  let blocks: ChaiBlock[] = [];
  blocks = flattenDeep([...blocks, ...getChildBlocks(allBlocks, blockId, blocks)]);
  return blocks;
};

export const pickOnlyAIProps = (blocks: ChaiBlock[], lang: string, isTranslatePrompt: boolean) => {
  return compact(
    blocks.map((block) => {
      const keys = ["_id", "_type", "_parent"];
      const newBlock = pick(block, keys);
      const registeredBlock = getRegisteredChaiBlock(block._type);
      const aiProps: Record<string, any> = {};
      const blockAiProps = get(registeredBlock, "aiProps", []) as string[];
      for (const key in block) {
        if (keys.includes(key as keyof ChaiBlock)) continue;
        if (blockAiProps.includes(key)) {
          const value = get(block, `${key}-${lang}`, "");
          const fallbackValue = get(block, key, "");
          aiProps[key] = isString(value) ? value.trim() || fallbackValue : fallbackValue;
          if (isTranslatePrompt) {
            aiProps[key] = fallbackValue;
          }
        }
      }
      if (isEmpty(aiProps)) return false;
      if (has(newBlock, "_parent") && isEmpty(newBlock._parent)) delete newBlock._parent;
      return { ...newBlock, ...aiProps };
    }),
  );
};

const addLangToPrompt = (prompt: string, currentLang: string, type: string) => {
  if (!currentLang || type !== "content") return prompt;
  return `${prompt}. Generate content in ${get(CHAI_LANGUAGES, currentLang, currentLang)} language.`;
};

export const askAiProcessingAtom = atom(false);

// update prompt for content type for lang support
export const useAskAi = () => {
  const [processing, setProcessing] = useAtom(askAiProcessingAtom);
  const [error, setError] = useState(null);
  const callBack = useBuilderProp("askAiCallBack", noop);
  const updateBlocksWithStream = useStreamMultipleBlocksProps();
  const updateBlockPropsAll = useUpdateMultipleBlocksProps();
  const [blocks] = useBlocksStore();
  const { selectedLang, fallbackLang } = useLanguages();
  const currentLang = selectedLang.length ? selectedLang : fallbackLang;

  const getBlockForStyles = (blockId: string, blocks: ChaiBlock[]) => {
    const block = cloneDeep(blocks.find((block) => block._id === blockId));
    for (const key in block) {
      const value = block[key as keyof ChaiBlock];
      if (typeof value === "string" && startsWith(value, STYLES_KEY)) {
        const { baseClasses, classes } = getSplitChaiClasses(value);
        block[key as keyof ChaiBlock] = compact(flattenDeep([baseClasses, classes])).join(" ");
      } else {
        if (key !== "_id") delete block[key];
      }
    }
    return block;
  };

  return {
    askAi: useCallback(
      async (
        type: "styles" | "content",
        blockId: string,
        prompt: string,
        onComplete?: (response?: ChaiAskAiResult) => void,
      ) => {
        if (!callBack) return;
        setProcessing(true);
        setError(null);
        try {
          const lang = selectedLang === fallbackLang ? "" : selectedLang;
          const isTranslatePrompt = prompt.toLowerCase().includes("translate the content");
          const aiBlocks =
            type === "content"
              ? pickOnlyAIProps(cloneDeep(getBlockWithChildren(blockId, blocks)), selectedLang, isTranslatePrompt)
              : [getBlockForStyles(blockId, blocks)];

          const askAiResponse = await callBack(type, addLangToPrompt(prompt, currentLang, type), aiBlocks, lang);
          if (askAiResponse === void 0) return;
          const { blocks: updatedBlocks, error } = askAiResponse as {
            blocks: ChaiBlock[];
            error: ChaiAskAiResult["error"];
          };
          if (error) {
            setError(error);
            return;
          }
          if (type === "styles") {
            const blocks = updatedBlocks.map((block) => {
              for (const key in block) {
                if (key !== "_id") {
                  block[key] = `${STYLES_KEY},${block[key]}`;
                }
              }
              return block;
            });
            updateBlockPropsAll(blocks);
          } else {
            updateBlocksWithStream(updatedBlocks);
          }
          if (onComplete) onComplete(askAiResponse);
        } catch (e) {
          setError(e as ChaiAskAiResult["error"]);
        } finally {
          setProcessing(false);
          if (onComplete) onComplete();
        }
      },
      [
        callBack,
        setProcessing,
        selectedLang,
        fallbackLang,
        blocks,
        currentLang,
        updateBlockPropsAll,
        updateBlocksWithStream,
      ],
    ),
    loading: processing,
    error,
  };
};
export const useAiAssistant = () => {
  const [, setRightPanel] = useRightPanel();
  return useCallback(
    (value: boolean) => {
      setRightPanel(value ? "ai" : "block");
    },
    [setRightPanel],
  );
};
