import { useAtom } from "jotai";
import { useEffect } from "react";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBroadcastChannel } from "~/builder/hooks/use-broadcast-channel";
import { useBuilderReset } from "~/builder/hooks/use-builder-reset";
import { useCheckStructure } from "~/builder/hooks/use-check-structure";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { syncBlocksWithDefaultProps } from "~/registry";
import { ChaiBlock } from "~/types/common";

/**
 * Applies the incoming page blocks to the editor store whenever their identity changes:
 * store reset + isPageLoaded false→true bracketing + cross-tab broadcast + structure validation.
 */
export const useWatchPageBlocks = (blocks?: ChaiBlock[]) => {
  const [, setAllBlocks] = useBlocksStore();
  const reset = useBuilderReset();
  const { postMessage } = useBroadcastChannel();
  const [, setIsPageLoaded] = useAtom(isPageLoadedAtom);
  const runValidation = useCheckStructure();

  useEffect(() => {
    setIsPageLoaded(false);
    // Zero-delay hop so the `false` above commits a render before the blocks apply —
    // consumers (e.g. use-block-selection-query-sync) reset per-page guards on that edge.
    // The cleanup cancels a superseded apply when the identity changes again quickly.
    const timer = setTimeout(() => {
      const withDefaults = syncBlocksWithDefaultProps(blocks || []);
      setAllBlocks(withDefaults);
      if (withDefaults && withDefaults.length > 0) {
        postMessage({ type: "blocks-updated", blocks: withDefaults });
      }
      reset();
      setIsPageLoaded(true);
      runValidation();
    }, 0);
    return () => clearTimeout(timer);
  }, [blocks]);
};
