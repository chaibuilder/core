import { isFunction } from "lodash-es";
import { z } from "zod";
import { COLLECTION_ITEM_TYPE } from "~/constants/BLOCK_TYPES";
import { getRegisteredChaiBlock } from "~/registry/v2/runtime/core";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { consumeProviderTags } from "~/server/chai-builder/public/register-cache-tags";
import { fetchConfigGlobalData, getConfigPageType, toChaiPageType } from "~/server/defaults/config-registry";
import { resolveBlockDataProvider } from "~/server/defaults/block-data-providers";
import { blockFiltersHaveBindings } from "~/server/repeater-data/build-repeater-query";
import { fetchRepeaterItems } from "~/server/repeater-data/fetch-repeater-items";
import { ChaiBlock } from "~/types/common";

type GetBlockAsyncPropsActionData = {
  block: ChaiBlock;
  pageProps: any;
  lang: string;
};

type GetBlockAsyncPropsActionResponse = any[] | Record<string, any>;

/**
 * Page external data for resolving {{...}} bindings in the block's filter values.
 * Mirrors the builder canvas's pageExternalData shape ({...pageTypeData, global, pageProps}).
 * Only built when the filters actually carry bindings.
 */
async function buildFilterBindingData(
  block: ChaiBlock,
  pageProps: any,
  lang: string,
): Promise<Record<string, any> | undefined> {
  if (!blockFiltersHaveBindings(block)) return undefined;
  const pageTypeEntry = pageProps?.pageType ? getConfigPageType(pageProps.pageType) : undefined;
  const pageType = pageTypeEntry ? toChaiPageType(pageTypeEntry) : undefined;
  const [pageData, globalData] = await Promise.all([
    pageType?.dataProvider ? pageType.dataProvider({ lang, draft: true, inBuilder: true, pageProps }) : {},
    fetchConfigGlobalData({ lang, draft: true, inBuilder: true }),
  ]);
  // Builder context: strip $cacheTags so it never leaks into binding data.
  return { ...(await consumeProviderTags(pageData ?? {}, false)), global: globalData, pageProps };
}

/**
 * Get Block Async Props Action
 * Fetches async data for a block, either from collections (for Repeater blocks)
 * or from the block's dataProvider function
 */
export class GetBlockAsyncPropsAction extends ChaiBaseAction<
  GetBlockAsyncPropsActionData,
  GetBlockAsyncPropsActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      block: z.any(),
      pageProps: z.any().optional().default({}),
      lang: z.string(),
    });
  }

  async execute(data: GetBlockAsyncPropsActionData): Promise<GetBlockAsyncPropsActionResponse> {
    try {
      const { block, pageProps, lang } = data;
      const blockType = block._type;

      // Handle Repeater/CollectionItem blocks with repeater-data / collection sources
      if ((blockType === "Repeater" || blockType === COLLECTION_ITEM_TYPE) && block?.repeaterItems?.includes("{{#")) {
        const result = await fetchRepeaterItems({
          block,
          pageProps: pageProps ?? {},
          lang,
          draft: true,
          inBuilder: true,
          externalData: await buildFilterBindingData(block, pageProps ?? {}, lang),
        });

        // Builder context: strip $cacheTags without registering.
        return result ? await consumeProviderTags(result, false) : [];
      }

      // Ensure config providers are synced into REGISTERED_CHAI_BLOCKS, then read from registry
      resolveBlockDataProvider(blockType);
      const blockDef = getRegisteredChaiBlock(blockType);
      if (!blockDef?.dataProvider || !isFunction(blockDef.dataProvider)) {
        return {};
      }

      const result = await blockDef.dataProvider({
        block,
        pageProps: pageProps as any,
        lang,
        draft: true,
        inBuilder: true,
      });

      // Builder context: strip $cacheTags without registering.
      return result ? await consumeProviderTags(result, false) : {};
    } catch (error) {
      return this.handleError(error);
    }
  }
}
