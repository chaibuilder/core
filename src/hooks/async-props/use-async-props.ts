import { COLLECTION_PREFIX } from "~/core/constants/STRINGS";
import { useBuilderProp } from "~/hooks/use-builder-prop";

import { isObject } from "@rjsf/utils";
import { atom, useAtom, useSetAtom } from "jotai";
import { get, isFunction, pick, startsWith, values } from "lodash-es";
import { useEffect, useState } from "react";
import { ChaiBlock } from "~/types/common";
import { useUpdateBlocksPropsRealtime } from "../use-update-blocks-props";

const CHAI_ASYNC_PROPS_STUB = async (_args: { block: ChaiBlock }) => ({});

type BlockAsyncProps = {
  status: "idle" | "loading" | "loaded" | "error";
  props: Record<string, any>;
  error?: any;
  repeaterItems?: string;
  totalItems?: number;
};

type BlockRepeaterDataAtom = Record<string, BlockAsyncProps>;

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
  const getAsyncBlockProps = useBuilderProp("getBlockAsyncProps", CHAI_ASYNC_PROPS_STUB);
  const setBlockRepeaterDataAtom = useSetAtom(blockRepeaterDataAtom);
  const depsString = JSON.stringify([block?._id, ...values(pick(block, dependencies ?? []))]);
  const isCollectionRepeater = block?._type === "Repeater" && startsWith(block.repeaterItems, `{{${COLLECTION_PREFIX}`);
  const isCustomBlockDataProvider = block?._type !== "Repeater" && dataProviderMode === "live";

  const shouldFetchData =
    (dataProviderMode === "mock" && isFunction(mockDataProvider)) ||
    (dataProviderMode === "live" && (isCollectionRepeater || isCustomBlockDataProvider));

  const [asyncProps, setAsyncProps] = useState<BlockAsyncProps>({
    status: shouldFetchData ? "loading" : "idle",
    props: {},
    error: undefined,
  });

  useEffect(() => {
    if (dataProviderMode === "mock") {
      if (isFunction(mockDataProvider)) {
        Promise.resolve().then(() => {
          const result = mockDataProvider({ block });
          if (!isObject(result)) {
            throw new Error("mockDataProvider should return an object");
          }
          setAsyncProps({ status: "loaded", props: result });
        });
      }
      return;
    }

    if (dataProviderMode !== "live") return;
    if (!isCollectionRepeater && !isCustomBlockDataProvider) return;

    getAsyncBlockProps({ block })
      .then((props = {}) => {
        if (isCollectionRepeater) {
          setBlockRepeaterDataAtom((prev) => ({
            ...prev,
            [block._id]: {
              status: "loaded",
              props: get(props, "items", []),
              repeaterItems: block.repeaterItems,
            },
          }));
          setAsyncProps({
            status: "loaded",
            props: { totalItems: get(props, "totalItems") },
          });
          updateRuntimeProps([block._id], {
            totalItems: get(props, "totalItems"),
          });
        } else {
          setAsyncProps({
            status: "loaded",
            props: isObject(props) ? props : {},
          });
        }
      })
      .catch((error) => {
        if (isCollectionRepeater) {
          setBlockRepeaterDataAtom((prev) => ({
            ...prev,
            [block._id]: { status: "error", error, props: [] },
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
  }, [
    block._id,
    depsString,
    isCollectionRepeater,
    isCustomBlockDataProvider,
    mockDataProvider,
    dataProviderMode,
    getAsyncBlockProps,
    block,
    setBlockRepeaterDataAtom,
    updateRuntimeProps,
  ]);

  const status = get(asyncProps, `status`);
  return {
    $loading: status === "loading",
    ...(block ? get(asyncProps, `props`, {}) : {}),
  };
};
