import { useAtom } from "jotai";
import { userActionsCountAtom } from "~/builder/atoms/builder";
import { aiAssistantActiveAtom } from "~/builder/atoms/ui";
import { useBlockRepeaterDataAtom } from "~/builder/hooks/async-props/use-async-props";
import { useUndoManager } from "~/builder/hooks/history/use-undo-manager";
import { useBlockHighlight } from "~/builder/hooks/use-block-highlight";
import { usePartialBlocksStore } from "~/builder/hooks/use-partial-blocks-store";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";

export const useBuilderReset = () => {
  const { clear } = useUndoManager();
  const [, setSelectedIds] = useSelectedBlockIds();
  const { clearHighlight } = useBlockHighlight();
  const [, setStylingHighlighted] = useSelectedStylingBlocks();
  const [, setAiAssistantActive] = useAtom(aiAssistantActiveAtom);
  const { reset: resetPartialBlocks } = usePartialBlocksStore();
  const { setSaveState } = useChaiSavePage();
  const [, setBlockRepeaterDataAtom] = useBlockRepeaterDataAtom();
  const [, setActionsCount] = useAtom(userActionsCountAtom);

  return () => {
    setBlockRepeaterDataAtom({});
    setSelectedIds([]);
    setStylingHighlighted([]);
    clearHighlight();
    clear();
    setAiAssistantActive(false);
    resetPartialBlocks();
    setSaveState("SAVED");
    setActionsCount(0);
  };
};
