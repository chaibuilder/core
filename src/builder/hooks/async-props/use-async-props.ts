import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { COLLECTION_ITEM_TYPE } from "~/constants/BLOCK_TYPES";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";

import { atom, useAtom, useSetAtom } from "jotai";
import { get, isEmpty, isFunction, isString, omit, pick, startsWith, values } from "lodash-es";
import { useEffect, useRef, useState } from "react";
import { ChaiBlock } from "~/types/common";
import { useUpdateBlocksPropsRealtime } from "../use-update-blocks-props";

// Mirrors @rjsf/utils' isObject: a non-null, non-array, non-File, non-Date object.
// Inlined so this hook — which the builder pulls in eagerly — does not drag the whole
// @rjsf/utils bundle into the initial chunk for one predicate.
const isObject = (thing: unknown): boolean => {
  if (typeof thing !== "object" || thing === null) return false;
  if (typeof File !== "undefined" && thing instanceof File) return false;
  if (typeof Date !== "undefined" && thing instanceof Date) return false;
  return !Array.isArray(thing);
};

// Settings changes update the block on every keystroke. Without a delay each one
// fires its own data provider call, so wait for the edits to settle first.
const DEBOUNCE_MS = 300;

type BlockAsyncProps = {
  status: "idle" | "loading" | "loaded" | "error";
  props: Record<string, any>;
  error?: any;
  repeaterItems?: string;
  totalItems?: number;
};

type BlockRepeaterDataAtom = Record<string, BlockAsyncProps>;

// A drop remounts the whole canvas (canvasRenderKeyAtom), so keep the last live result
// per block to reuse when it remounts with the same deps instead of refetching.
const liveAsyncPropsCache = new Map<string, { depsString: string; provider: unknown; props: Record<string, any> }>();

// Data providers swallow fetch errors into empty values, so an all-empty result is not cached.
const hasAnyData = (props: Record<string, any>) =>
  values(props).some((value) => value != null && !((typeof value === "object" || isString(value)) && isEmpty(value)));

export const blockRepeaterDataAtom = atom<BlockRepeaterDataAtom>({});
blockRepeaterDataAtom.debugLabel = "blockRepeaterDataAtom";

export const useBlockRepeaterDataAtom = () => useAtom(blockRepeaterDataAtom);

export const useAsyncProps = (
  block: ChaiBlock,
  dataProviderMode: "live" | "mock",
  dependencies?: string[],
  mockDataProvider?: (args: { block: ChaiBlock }) => object,
) => {
  const updateRuntimeProps = useUpdateBlocksPropsRealtime();
  const getAsyncBlockProps = useBuilderProp("getBlockAsyncProps", async (_args: { block: ChaiBlock }) => ({}));
  const setBlockRepeaterDataAtom = useSetAtom(blockRepeaterDataAtom);
  const depsString = JSON.stringify([block?._id, ...values(pick(block, dependencies ?? []))]);
  const isCollectionRepeater =
    (block?._type === "Repeater" || block?._type === COLLECTION_ITEM_TYPE) &&
    startsWith(block.repeaterItems, `{{${COLLECTION_PREFIX}`);
  const isCustomBlockDataProvider =
    block?._type !== "Repeater" && block?._type !== COLLECTION_ITEM_TYPE && dataProviderMode === "live";
  // A Collection Item with no filter has no find to run. Fetching anyway would
  // return the source's first item, so picking a data source alone would look
  // like a successful find on the canvas.
  const collectionItemHasNoFind = block?._type === COLLECTION_ITEM_TYPE && isEmpty(get(block, "filters", []));

  const shouldFetchData =
    (dataProviderMode === "mock" && isFunction(mockDataProvider)) ||
    (dataProviderMode === "live" &&
      ((isCollectionRepeater && !collectionItemHasNoFind) || isCustomBlockDataProvider));

  const cachedLive = isCustomBlockDataProvider ? liveAsyncPropsCache.get(block?._id) : undefined;
  const cachedLiveProps =
    cachedLive?.depsString === depsString && cachedLive.provider === getAsyncBlockProps ? cachedLive.props : undefined;

  const [asyncProps, setAsyncProps] = useState<BlockAsyncProps>(() =>
    cachedLiveProps
      ? { status: "loaded", props: cachedLiveProps }
      : { status: shouldFetchData ? "loading" : "idle", props: {}, error: undefined },
  );

  const blockRef = useRef(block);
  useEffect(() => {
    blockRef.current = block;
  }, [block]);

  const updateRuntimePropsRef = useRef(updateRuntimeProps);
  useEffect(() => {
    updateRuntimePropsRef.current = updateRuntimeProps;
  }, [updateRuntimeProps]);

  useEffect(() => {
    if (!shouldFetchData || cachedLiveProps) return;

    // Cancelled covers the request already in flight when the deps change again:
    // its response is stale and must not overwrite the newer one.
    let cancelled = false;

    const timer = setTimeout(() => {
      if (dataProviderMode === "mock") {
        if (!isFunction(mockDataProvider)) return;
        Promise.resolve()
          .then(() => {
            const result = mockDataProvider({ block: blockRef.current });
            if (!isObject(result)) throw new Error("mockDataProvider should return an object");
            if (cancelled) return;
            setAsyncProps({ status: "loaded", props: result });
          })
          .catch((error) => {
            if (cancelled) return;
            setAsyncProps({ status: "error", error, props: {} });
          });
        return;
      }

      getAsyncBlockProps({ block: blockRef.current })
        .then((props = {}) => {
          if (cancelled) return;
          if (isCollectionRepeater) {
            setBlockRepeaterDataAtom((prev) => ({
              ...prev,
              [blockRef.current._id]: {
                status: "loaded",
                props: get(props, "items", []),
                repeaterItems: blockRef.current.repeaterItems,
              },
            }));
            // totalItems drives pagination — a Repeater-only concern. Writing it as
            // a realtime prop on a CollectionItem would add a stray prop to the page.
            if (blockRef.current._type === "Repeater") {
              setAsyncProps({
                status: "loaded",
                props: { totalItems: get(props, "totalItems") },
              });
              updateRuntimePropsRef.current([blockRef.current._id], {
                totalItems: get(props, "totalItems"),
              });
            } else {
              setAsyncProps({ status: "loaded", props: {} });
            }
          } else {
            const loadedProps = isObject(props) ? props : {};
            if (isCustomBlockDataProvider && hasAnyData(loadedProps)) {
              liveAsyncPropsCache.set(blockRef.current._id, {
                depsString,
                provider: getAsyncBlockProps,
                props: loadedProps,
              });
            }
            setAsyncProps({ status: "loaded", props: loadedProps });
          }
        })
        .catch((error) => {
          if (cancelled) return;
          if (isCollectionRepeater) {
            setBlockRepeaterDataAtom((prev) => ({
              ...prev,
              [blockRef.current._id]: { status: "error", error, props: [] },
            }));
            setAsyncProps({
              status: "error",
              error,
              props: {},
            });
          } else {
            setAsyncProps({
              status: "error",
              error,
              props: {},
            });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    depsString,
    shouldFetchData,
    cachedLiveProps,
    isCollectionRepeater,
    isCustomBlockDataProvider,
    mockDataProvider,
    dataProviderMode,
    getAsyncBlockProps,
    setBlockRepeaterDataAtom,
  ]);

  // Removing the last filter has to drop the item fetched by the previous find,
  // otherwise the canvas keeps rendering a stale item no filter asks for.
  const blockId = get(block, "_id", "");
  useEffect(() => {
    if (!collectionItemHasNoFind || !blockId) return;
    setBlockRepeaterDataAtom((prev) => (prev[blockId] ? omit(prev, blockId) : prev));
  }, [collectionItemHasNoFind, blockId, setBlockRepeaterDataAtom]);

  const status = get(asyncProps, `status`);
  return {
    $loading: status === "loading",
    ...(block ? get(asyncProps, `props`, {}) : {}),
  };
};
