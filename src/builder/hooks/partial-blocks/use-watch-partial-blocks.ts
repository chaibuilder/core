import { useAtom } from "jotai";
import { get } from "lodash-es";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { PartialBlockEntry } from "~/types/partial-blocks";
import { partialBlocksAtom } from "./atoms";
import { extractPartialIds, isMissingPartialError } from "./utils";

export const useWatchPartialBlocks = () => {
  const { t } = useTranslation();
  const [blocksStore] = useBlocksStore();
  const [partialBlocks, setPartialBlocks] = useAtom(partialBlocksAtom);
  const getPartialBlockBlocks = useBuilderProp("getPartialBlockBlocks", async (_key: string) => []);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Collect partial block IDs from page blocks
  const pagePartialBlocksList = useMemo(() => {
    return blocksStore
      .filter((block) => block._type === "PartialBlock" || block._type === "GlobalBlock")
      .map((block) => get(block, "partialBlockId", get(block, "globalBlock", "")))
      .filter(Boolean) as string[];
  }, [blocksStore]);

  // BFS from the page's partials through loaded entries' dependencies, capped
  // at MAX_PARTIAL_DEPTH — levels the canvas won't render aren't fetched. The
  // depth map doubles as a visited set, so cycles can't loop the fetch queue.
  const partialBlocksList = useMemo(() => {
    const depthById = new Map<string, number>();
    pagePartialBlocksList.forEach((id) => depthById.set(id, 1));
    let frontier = pagePartialBlocksList;
    for (let depth = 2; depth <= MAX_PARTIAL_DEPTH && frontier.length > 0; depth++) {
      const next: string[] = [];
      frontier.forEach((id) => {
        const entry = partialBlocks[id];
        if (entry?.status !== "loaded") return;
        entry.dependencies.forEach((dep) => {
          if (!depthById.has(dep)) {
            depthById.set(dep, depth);
            next.push(dep);
          }
        });
      });
      frontier = next;
    }
    return [...depthById.keys()];
  }, [pagePartialBlocksList, partialBlocks]);

  // Queue-based fetching with ref to prevent duplicate fetches
  useEffect(() => {
    const toFetch = partialBlocksList.filter((id) => {
      const entry = partialBlocks[id];
      const isAlreadyFetching = fetchingRef.current.has(id);
      const needsFetch = !entry || entry.status === "idle";
      return needsFetch && !isAlreadyFetching;
    });

    if (toFetch.length === 0) return;

    // Mark as fetching
    toFetch.forEach((id) => fetchingRef.current.add(id));

    // Set loading state for all
    setPartialBlocks((prev) => {
      const updates: Record<string, PartialBlockEntry> = {};
      toFetch.forEach((id) => {
        updates[id] = { blocks: [], dependencies: [], status: "loading" };
      });
      return { ...prev, ...updates };
    });

    // Fetch all in parallel
    Promise.all(
      toFetch.map(async (partialBlockId) => {
        try {
          const blocks = await getPartialBlockBlocks(partialBlockId);
          const dependencies = extractPartialIds(blocks);
          setPartialBlocks((prev) => ({
            ...prev,
            [partialBlockId]: { blocks, dependencies, status: "loaded" },
          }));
        } catch (error) {
          const isMissing = isMissingPartialError(error);
          setPartialBlocks((prev) => ({
            ...prev,
            [partialBlockId]: {
              blocks: [],
              dependencies: [],
              status: isMissing ? "missing" : "error",
              error: isMissing
                ? t("This global block no longer exists")
                : error instanceof Error
                  ? error.message
                  : t("Failed to fetch"),
            },
          }));
        } finally {
          fetchingRef.current.delete(partialBlockId);
        }
      }),
    );
  }, [partialBlocksList, partialBlocks, setPartialBlocks, getPartialBlockBlocks, t]);
};
