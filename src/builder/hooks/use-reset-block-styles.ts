import { pick } from "lodash-es";
import { useCallback } from "react";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { useUpdateBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import { getChaiBlockDefaultProps } from "~/registry";

/**
 * useResetBlockStyles
 *
 * Provides helper functions to reset style props of the currently selected block.
 *
 * resetAll(): resets every style prop of the current block back to its default value.
 * reset(styleId): resets a single style prop back to its default value.
 */
export const useResetBlockStyles = () => {
  const selectedBlock = useSelectedBlock();
  const updateBlocksProps = useUpdateBlocksProps();

  const getDefaultStyles = useCallback((blockType: string) => {
    const defaults = getChaiBlockDefaultProps(blockType) as Record<string, any>;
    return defaults || {};
  }, []);

  const getStyleProps = useCallback((block: Record<string, any>) => {
    return Object.keys(block).filter(
      (prop) => typeof block[prop] === "string" && (block[prop] as string).startsWith("#styles:"),
    );
  }, []);

  const reset = useCallback(
    (styleId: string) => {
      if (!selectedBlock) return;
      const defaults = getDefaultStyles(selectedBlock._type);
      const value = defaults[styleId] ?? "#styles:,";
      updateBlocksProps([selectedBlock._id], { [styleId]: value });
    },
    [selectedBlock, getDefaultStyles, updateBlocksProps],
  );

  const resetAll = useCallback(() => {
    if (!selectedBlock) return;
    const styleProps = getStyleProps(selectedBlock);
    if (styleProps.length === 0) return;
    const defaults = getDefaultStyles(selectedBlock._type);
    const propsToReset = pick(defaults, styleProps);
    updateBlocksProps([selectedBlock._id], propsToReset);
  }, [selectedBlock, getStyleProps, getDefaultStyles, updateBlocksProps]);

  return { resetAll, reset } as const;
};
