import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { userActionsCountAtom } from "~/builder/atoms/builder";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { builderSaveStateAtom, useChaiSavePage } from "~/builder/hooks/use-save-page";

export const useAutoSave = () => {
  const { savePage, saveState } = useChaiSavePage();
  const autoSave = useBuilderProp("autoSave", true);
  const autoSaveActionsCount = useBuilderProp("autoSaveActionsCount", 10);
  const [actionsCount] = useAtom(userActionsCountAtom);
  useEffect(() => {
    if (!autoSave) return;
    if (saveState === "SAVED" || saveState === "SAVING") return;
    if (actionsCount >= autoSaveActionsCount) {
      savePage(true);
    }
  }, [autoSave, savePage, saveState, actionsCount, autoSaveActionsCount]);
};

export const useIncrementActionsCount = () => {
  // PERF: setters only — this hook sits in the update path of every canvas
  // block and outline node; subscribing to the count or the whole useSavePage
  // state would re-render all of them on each edit
  const setActionsCount = useSetAtom(userActionsCountAtom);
  const setSaveState = useSetAtom(builderSaveStateAtom);
  return useCallback(() => {
    setActionsCount((prev) => prev + 1);
    setSaveState((prev) => (prev !== "UNSAVED" ? "UNSAVED" : prev));
  }, [setActionsCount, setSaveState]);
};
