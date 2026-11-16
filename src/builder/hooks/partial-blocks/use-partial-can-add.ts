import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { CanAddPartialResult } from "~/types/partial-blocks";
import { partialBlocksAtom } from "./atoms";
import { usePartialGraph } from "./use-partial-graph";
import { getPartialDepth, wouldCreateCycle } from "./utils";

export const usePartialDependencies = () => {
  const [partialBlocks] = useAtom(partialBlocksAtom);
  return useMemo(() => {
    const deps: Record<string, string[]> = {};
    Object.entries(partialBlocks).forEach(([id, entry]) => {
      deps[id] = entry.dependencies;
    });
    return deps;
  }, [partialBlocks]);
};

/**
 * Can the partial `targetPartialId` be added to the page currently being
 * edited? Enforces the nesting rules:
 * - a partial can never be added inside itself (directly or via a cycle)
 * - the total partial chain below any page is at most MAX_PARTIAL_DEPTH:
 *   levels already above the edited partial + the target's own subtree
 *   depth must fit within the limit
 */
export const useCheckPartialCanAdd = () => {
  const currentPageId = useBuilderProp("pageId", "");
  const { dependencies, isPartialPage, getUsageDepth } = usePartialGraph();
  const { singular, plural } = usePartialTypeLabel();

  return useCallback(
    (targetPartialId: string): CanAddPartialResult => {
      if (!currentPageId || !targetPartialId) return { canAdd: true };

      // Self-reference check
      if (currentPageId === targetPartialId) {
        return { canAdd: false, reason: `This ${singular} cannot be added inside itself` };
      }

      // Circular dependency check
      if (wouldCreateCycle(currentPageId, targetPartialId, dependencies)) {
        return {
          canAdd: false,
          reason: `Adding this ${singular} would create a circular reference`,
        };
      }

      // Chain accounting: a page contributes no levels; editing a partial
      // means the target lands at (levels above the partial + 1) already.
      const editingPartial = isPartialPage(currentPageId);
      const usageDepth = editingPartial ? getUsageDepth(currentPageId) : 0;
      const chainAbove = editingPartial ? 1 + usageDepth : 0;
      const targetDepth = getPartialDepth(targetPartialId, dependencies);

      if (chainAbove + targetDepth > MAX_PARTIAL_DEPTH) {
        if (editingPartial && usageDepth > 0) {
          return {
            canAdd: false,
            reason: `This ${singular} is used inside another ${singular}. Adding this ${singular} here would exceed the maximum nesting depth (${MAX_PARTIAL_DEPTH} levels)`,
          };
        }
        if (editingPartial && targetDepth > 1) {
          return {
            canAdd: false,
            reason: `This ${singular} contains other ${plural} and would exceed the maximum nesting depth (${MAX_PARTIAL_DEPTH} levels)`,
          };
        }
        return {
          canAdd: false,
          reason: `Maximum nesting depth (${MAX_PARTIAL_DEPTH} levels) would be exceeded`,
        };
      }

      return { canAdd: true };
    },
    [currentPageId, dependencies, isPartialPage, getUsageDepth, singular, plural],
  );
};

export const useCanAddPartial = (targetPartialId: string): CanAddPartialResult => {
  const checkPartialCanAdd = useCheckPartialCanAdd();
  return useMemo(() => checkPartialCanAdd(targetPartialId), [checkPartialCanAdd, targetPartialId]);
};
