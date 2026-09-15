import { COLLECTION_ITEM_TYPE } from "~/constants/BLOCK_TYPES";
import { fetchConfigGlobalData, getResolvedPageType } from "~/server/defaults";
import { getFrameworkAdapter } from "~/server/framework-adapter";
import { blockFiltersHaveBindings } from "~/server/repeater-data/build-repeater-query";
import { fetchRepeaterItems } from "~/server/repeater-data/fetch-repeater-items";
import type { ChaiBlock, ChaiPageProps } from "~/types";
import { getInitializedState } from "../state";
import { withChaiCache, withRequestCache } from "./cache-utils";
import { consumeProviderTags, registerCacheTags, repeaterDataTag } from "./register-cache-tags";

// Stable function reference for caching - defined once at module level
async function fetchSiteGlobalData(appId: string, draftMode: boolean, lang: string): Promise<Record<string, unknown>> {
  return await fetchConfigGlobalData({ lang, draft: draftMode, inBuilder: false });
}

export const getSiteGlobalData = async (lang: string): Promise<Record<string, unknown>> => {
  const state = getInitializedState();
  const appId = state.appId!;

  return await withChaiCache(
    fetchSiteGlobalData,
    [`site-global-data-${appId}-${lang}`],
    [`site-global-data`, `site-global-data-${appId}`],
    false,
    "fetchSiteGlobalData",
  )(appId, state.draftMode, lang);
};

// Stable function reference for caching - defined once at module level
async function fetchDataByPageType(
  pageTypeKey: string,
  lang: string,
  draftMode: boolean,
  pageProps: ChaiPageProps,
): Promise<Record<string, unknown>> {
  const registeredPageType = getResolvedPageType(pageTypeKey);

  if (!registeredPageType?.dataProvider) {
    return {};
  }

  return await registeredPageType.dataProvider!({
    lang,
    draft: draftMode,
    inBuilder: false,
    pageProps,
  });
}

export const getDataByPageType = async (args: {
  pageType: string;
  pageProps: ChaiPageProps;
  lang: string;
}): Promise<Record<string, unknown>> => {
  const state = getInitializedState();
  const { pageType, pageProps, lang } = args;
  const appId = state.appId!;

  // Request-cached only, like repeater data: the provider runs on every route
  // regeneration, so its $cacheTags can invalidate the page per document. The
  // old persistent entry keyed by slug+pageId only saved repeat regenerations
  // of the same page. Its tags move onto the route itself so firing
  // `page-type-data-*` (payload publish flow) still regenerates these pages.
  const data = await withRequestCache(fetchDataByPageType, "fetchDataByPageType")(
    pageType,
    lang,
    state.draftMode,
    pageProps,
  );
  await registerCacheTags([`page-type-data`, `page-type-data-${appId}`, `page-type-data-${appId}-${pageType}`]);
  const pageTypeData = await consumeProviderTags(data ?? {}, true);

  // A dynamic template matches a URL by its segment pattern, so routing alone
  // cannot tell a real item from a URL shaped like one. `$notFound` is the
  // provider answering that question: 404 instead of rendering the template
  // with nothing bound to it, which is an empty page served as 200. Thrown
  // after the tags above are registered, so publishing the item later still
  // regenerates this route.
  if (data?.$notFound) {
    getFrameworkAdapter().pageNotFound();
  }

  return pageTypeData;
};

// Stable function reference for caching - defined once at module level
async function fetchCollectionData(
  appId: string,
  collectionId: string,
  blockId: string,
  lang: string,
  draftMode: boolean,
  pageProps: ChaiPageProps,
  block: ChaiBlock,
  externalData?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // totalItems drives pagination — a Repeater-only concern; a CollectionItem
  // never paginates, so emitting the key for it would only bloat the page data.
  const withTotalItems = (items: unknown[], totalItems: number): Record<string, unknown> => ({
    [`#${collectionId}/${blockId}`]: items,
    ...(block._type === "Repeater" ? { [`#${collectionId}/${blockId}/totalItems`]: totalItems } : {}),
  });
  // Registered even when the fetch fails, so a page that cached an empty
  // error result can still be invalidated by a source-level tag fire.
  await registerCacheTags([repeaterDataTag(appId, collectionId)]);
  try {
    const result = await fetchRepeaterItems({
      block,
      pageProps,
      lang,
      draft: draftMode,
      inBuilder: false,
      externalData,
    });
    const data = result ? await consumeProviderTags(result, true) : null;
    return withTotalItems(data?.items ?? [], data?.totalItems ?? -1);
  } catch {
    return withTotalItems([], -1);
  }
}

export const getDataByCollections = async (args: {
  blocks: ChaiBlock[];
  pageProps: ChaiPageProps;
  lang: string;
  externalData?: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const state = getInitializedState();
  const { blocks, pageProps, lang, externalData } = args;

  const collectionRepeaterBlocks = blocks.filter(
    (block) =>
      (block._type === "Repeater" || block._type === COLLECTION_ITEM_TYPE) && block?.repeaterItems?.includes("{{#"),
  );

  if (collectionRepeaterBlocks.length === 0) {
    return {};
  }

  const collectionPromises = collectionRepeaterBlocks.map((block) => {
    const collectionId: string = block.repeaterItems.replace("{{#", "").replace("}}", "");

    return withRequestCache(fetchCollectionData, "fetchCollectionData")(
      state.appId!,
      collectionId,
      block._id,
      lang,
      state.draftMode,
      pageProps,
      block,
      externalData,
    );
  });

  const collectionResults = await Promise.all(collectionPromises);

  return collectionResults.reduce(
    (acc: Record<string, unknown>, block: Record<string, unknown>) => {
      return { ...acc, ...block };
    },
    {} as Record<string, unknown>,
  );
};

export const getPageData = async (args: {
  blocks: ChaiBlock[];
  pageProps: ChaiPageProps;
  pageType: string;
  lang: string;
}): Promise<Record<string, unknown>> => {
  const { blocks, pageProps, pageType, lang } = args;
  const globalDataPromise = getSiteGlobalData(lang);
  const pageDataPromise = getDataByPageType({ pageType, pageProps, lang });

  // Repeater filter values may carry {{...}} bindings into page/global data. Only
  // then does the collection fetch wait on that data; otherwise all three stay parallel.
  let externalData: Record<string, unknown> | undefined;
  if (blocks.some((block) => (block._type === "Repeater" || block._type === COLLECTION_ITEM_TYPE) && blockFiltersHaveBindings(block))) {
    const [globalData, pageData] = await Promise.all([globalDataPromise, pageDataPromise]);
    externalData = { ...pageData, global: globalData, pageProps };
  }

  const [globalData, pageData, collectionData] = await Promise.all([
    globalDataPromise,
    pageDataPromise,
    getDataByCollections({ blocks, pageProps, lang, externalData }),
  ]);

  return {
    ...pageData,
    global: globalData,
    pageProps,
    ...collectionData,
  };
};
