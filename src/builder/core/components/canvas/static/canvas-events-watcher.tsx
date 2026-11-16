import { first, isEmpty } from "lodash-es";
import { useEffect } from "react";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { useFrame } from "~/builder/core/frame";
import { useBlockHighlight } from "~/builder/hooks/use-block-highlight";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";
import { getPartialWrapperTag } from "~/constants/PARTIAL_BLOCKS";
import { getElementByDataBlockId } from "./chai-canvas";

const areSameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

export const CanvasEventsWatcher = () => {
  const [ids, setIds] = useSelectedBlockIds();
  const [styleIds, setSelectedStylingBlocks] = useSelectedStylingBlocks();
  // A partial gaining a wrapper gets a styled element it lacked; re-check only when that tag changes.
  const selectedBlock = useSelectedBlock();
  const wrapperTag = selectedBlock ? getPartialWrapperTag(selectedBlock) : null;
  const { document } = useFrame();
  const { clearHighlight } = useBlockHighlight();

  useEffect(() => {
    if (isEmpty(ids) || !isEmpty(styleIds)) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (!isEmpty(styleIds)) {
        return;
      }
      const element = getElementByDataBlockId(document, first(ids) as string);
      if (element) {
        const styleProp = element.getAttribute("data-style-prop") as string;
        if (styleProp) {
          const styleId = element.getAttribute("data-style-id") as string;
          const blockId = element.getAttribute("data-block-parent") as string;
          setSelectedStylingBlocks([{ id: styleId, prop: styleProp, blockId }]);
        }
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [document, ids, wrapperTag, setSelectedStylingBlocks, styleIds]);
  // Add cleanup effect
  useEffect(() => {
    return () => clearHighlight();
  }, [clearHighlight]);

  usePubSubListener(CHAI_BUILDER_EVENTS.CANVAS_BLOCK_SELECTED, (blocks?: string[]) => {
    if (!blocks) return;
    setIds((prev) => (areSameIds(prev, blocks) ? prev : blocks));
  });

  usePubSubListener(
    CHAI_BUILDER_EVENTS.CANVAS_BLOCK_STYLE_SELECTED,
    (data?: { blockId: string; styleId: string; styleProp: string }) => {
      if (!data) return;
      const { blockId, styleId, styleProp } = data;
      if (!blockId) return;
      setSelectedStylingBlocks([{ id: styleId, prop: styleProp, blockId }]);
      setIds((prev) => (prev.length === 1 && prev[0] === blockId ? prev : [blockId]));
    },
  );

  usePubSubListener(CHAI_BUILDER_EVENTS.CLEAR_CANVAS_SELECTION, () => {
    clearHighlight();
    setIds([]);
    setSelectedStylingBlocks([]);
  });

  return null;
};
