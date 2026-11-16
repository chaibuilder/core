import { compact, each, get, pick } from "lodash-es";
import { useCallback } from "react";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { getRegisteredChaiBlock } from "~/registry";
import { getBlockWithNestedChildren } from "./get-block-with-nested-children";

export const useI18nBlocks = () => {
  const selectedBlock = useSelectedBlock();
  const [currentBlocks] = useBlocksStore();
  return useCallback(
    (lang: string | "ALL" = "") => {
      const blocks = selectedBlock?._id ? getBlockWithNestedChildren(selectedBlock._id, currentBlocks) : currentBlocks;
      if (!blocks) return [];
      return compact(
        blocks.map((block) => {
          const blockDefinition = getRegisteredChaiBlock(block._type);
          if (!blockDefinition) return null;
          const i18nProps = blockDefinition?.i18nProps ?? [];
          if (i18nProps.length === 0) return null;
          const keys =
            lang === "ALL"
              ? Object.keys(block).filter((key) => i18nProps.find((prop) => key.startsWith(prop)))
              : i18nProps.map((prop) => (lang ? `${prop}-${lang}` : prop));
          const blockProps: Record<string, any> = pick(block, ["_id"]);
          const isLangCode = !!lang && lang !== "ALL";
          each(keys, (key) => {
            const value = get(block, key);
            // A blank translation (`content-en: ""` or `"   "`) gives the model
            // nothing to edit; send the default-language text so it can translate it.
            if (value === undefined || (isLangCode && typeof value === "string" && value.trim() === "")) {
              const defaultKey = key.replace(`-${lang}`, "");
              blockProps[defaultKey] = get(block, defaultKey);
            } else {
              blockProps[key] = value;
            }
          });
          return blockProps;
        }),
      );
    },
    [selectedBlock, currentBlocks],
  );
};
