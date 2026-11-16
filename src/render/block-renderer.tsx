import { get, has, isArray, isFunction, isNull, omit } from "lodash-es";
import { createElement, Suspense } from "react";
import {
  applyLanguage,
  applyLimit,
  getBlockRuntimeProps,
  getBlockTagAttributes,
} from "~/builder/core/components/canvas/static/new-blocks-render-helpers";
import { getRegisteredChaiBlock, resolveChaiBlockComponent } from "~/registry";
import { ChaiBlockConfig } from "~/types/blocks";
import { ChaiBlock, ChaiPageProps } from "~/types/common";
import { applyBindingToBlockProps } from "./apply-binding";
import DataProviderPropsBlock from "./async-props-block";
import { resolveBindingVisibility } from "./binding-engine";
import { CORE_SDK_BLOCKS } from "./core-sdk-blocks";
import { shouldInlineDataProviders } from "./inline-data-providers";
import { getRuntimePropValues, RenderChaiBlocksProps } from "./render-chai-blocks-sdk";

import { RenderOnOpen } from "./render-on-open.lazy";
import { ROOT_BLOCK_PROPS } from "~/utils/site-layout-css";
const SuspenseFallback = () => <div></div>;

// `pageData` handed to components: `externalData` minus `global` (site-wide
// parameters, ~50 KB on a VDP) that no block reads at runtime; bindings still
// resolve against the full object. Memoized per `externalData` so every block
// shares one identity and Flight serializes it once instead of per block.
const slimPageDataCache = new WeakMap<object, Record<string, unknown>>();
const getSlimPageData = (externalData: Record<string, unknown> | undefined) => {
  if (!externalData) return {};
  let slim = slimPageDataCache.get(externalData);
  if (!slim) slimPageDataCache.set(externalData, (slim = omit(externalData, ["global"])));
  return slim;
};

// Props handed to a 'use client' component are serialized into the Flight
// payload, so only server fallbacks receive the block props.
const isClientReference = (component: unknown) =>
  (component as { $$typeof?: symbol } | null)?.$$typeof === Symbol.for("react.client.reference");

export const RenderBlock = async (
  props: RenderChaiBlocksProps & {
    repeaterData?: { index: number; dataKey: string; scrollsX?: boolean };
    collectionItemData?: { itemKey: string };
    block: ChaiBlock;
    slotProps?: Record<string, React.ReactNode>;
    children: ({
      _id,
      _type,
      repeaterItems,
      $repeaterItemsKey,
    }: {
      _id: string;
      _type: string;
      repeaterItems?: any;
      $repeaterItemsKey?: string;
      partialBlockId?: string;
    }) => React.ReactNode;
  },
) => {
  const {
    block,
    lang,
    fallbackLang,
    children,
    externalData,
    designTokens,
    blocks,
    draft,
    pageProps,
    blockErrorBoundary,
    slotProps,
  } = props;
  const registeredChaiBlock = getRegisteredChaiBlock(block._type) as ChaiBlockConfig;
  const Component = resolveChaiBlockComponent(registeredChaiBlock as any, block._variant);
  const index = get(props.repeaterData, "index", -1);
  const dataKey = get(props.repeaterData, "dataKey", "");
  const itemKey = get(props.collectionItemData, "itemKey", "");

  const bindingLangSuffix = lang === fallbackLang ? "" : (lang ?? "");
  const bindingLocale = lang || fallbackLang || "en";
  const blockWithBinding: ChaiBlock = applyBindingToBlockProps(
    applyLanguage(block, bindingLangSuffix, registeredChaiBlock),
    externalData ?? {},
    { index, key: dataKey, locale: bindingLocale, itemKey },
  );
  // From the bound block, so `{{…}}` in authored attributes (aria-label, title,
  // alt…) resolves like text content; React escapes attribute values itself.
  const blockAttributesProps = getBlockTagAttributes(blockWithBinding, false);
  const runtimeProps = getRuntimePropValues(blocks, block._id, getBlockRuntimeProps(block._type));
  const hasDataProvider = has(registeredChaiBlock, "dataProvider") && isFunction(registeredChaiBlock.dataProvider);

  const newBlock: ChaiBlock = {
    ...blockWithBinding,
    ...blockAttributesProps,
    ...runtimeProps,
  };

  const blockProps = {
    blockProps: block._parent ? {} : ROOT_BLOCK_PROPS,
    inBuilder: false,
    draft: draft ?? false,
    pageData: getSlimPageData(externalData),
    designTokens,
    pageProps: pageProps as ChaiPageProps,
    // Position inside the enclosing Repeater (absent outside one), so blocks can
    // treat the first item differently (the Image block eager-loads only index 0,
    // and holds the src of later cards back when the Repeater scrolls horizontally).
    ...(index >= 0 ? { $repeaterIndex: index, $repeaterScrollsX: get(props.repeaterData, "scrollsX", false) } : {}),
    ...newBlock,
    ...slotProps,
    // After the block's props: a stale stored `lang` must never override the page's.
    lang: lang || fallbackLang || "en",
  };
  const isShown = resolveBindingVisibility(get(newBlock, "_show", true), externalData ?? {}, {
    index,
    repeaterKey: dataKey,
    itemKey,
    locale: bindingLocale,
  });
  if (isNull(Component) || !isShown) return null;

  // Wrap app "custom" blocks in the injected error boundary so a throwing block
  // degrades to nothing rather than crashing the whole page. Core/structural
  // SDK blocks stay unwrapped (they hold children, rarely throw). No-op when the
  // app didn't inject a boundary.
  const isCustomBlock = !CORE_SDK_BLOCKS.includes(block._type);
  const wrap = (element: React.ReactNode): React.ReactNode =>
    blockErrorBoundary && isCustomBlock
      ? createElement(blockErrorBoundary, { blockName: block._type, children: element })
      : element;

  // Opt-in per block: a closed panel's content renders on its first open
  // instead of in the HTML. Only for panels whose links all appear elsewhere
  // on the page, since crawlers never open them.
  const renderOnOpen = get(block, ["styles_attrs", "data-render"]) === "on-open";
  const blockChildren = () => {
    const kids = children({
      _id: block._id,
      _type: block._type,
      ...(isArray(blockWithBinding.repeaterItems)
        ? {
            repeaterItems: applyLimit(blockWithBinding.repeaterItems, block),
            $repeaterItemsKey: blockWithBinding.$repeaterItemsKey,
            repeaterTotalItems: blockWithBinding.repeaterTotalItems ?? -1,
          }
        : {}),
    });
    return kids && renderOnOpen ? <RenderOnOpen>{kids}</RenderOnOpen> : kids;
  };

  const withDataProviderProps = (dataProviderProps: Record<string, any>) =>
    createElement(
      Component,
      {
        ...blockProps,
        ...dataProviderProps,
        ...slotProps,
      },
      blockChildren(),
    );

  if (hasDataProvider) {
    const suspenseFallback = get(registeredChaiBlock, "suspenseFallback", SuspenseFallback) as React.ComponentType<any>;
    // Prefer a precomputed (e.g. batched) promise for this block when provided,
    // otherwise fall back to invoking the registered per-block dataProvider.
    const precomputed = props.dataProviders ? props.dataProviders[block._id] : undefined;
    const dataProvider = precomputed ? () => precomputed : registeredChaiBlock.dataProvider!;

    // Default path: await the (already in-flight) provider here so this
    // component resolves before React renders it. Nothing suspends, so the
    // markup lands in the document shell instead of a `<div hidden id="S:n">`
    // that only becomes visible once React's `$RC` runs — which never happens
    // with JavaScript disabled. Streaming is still reachable via
    // `CHAI_DISABLE_INLINE_DATA_PROVIDERS`; see `shouldInlineDataProviders`.
    //
    // `DataProviderPropsBlock` is called directly rather than rendered as
    // an element: it is a plain async function, so awaiting it reuses its
    // `consumeProviderTags` cache-tag registration and `LOG_PAGE_BUILD_TIMINGS`
    // instrumentation while guaranteeing nothing suspends. Rendering it
    // unwrapped would instead bubble to whatever `<Suspense>` happens to be
    // above us, which would silently put the content back in a hidden container.
    if (shouldInlineDataProviders()) {
      try {
        return wrap(
          await DataProviderPropsBlock({
            lang: lang ?? "",
            pageProps: pageProps as ChaiPageProps,
            block: newBlock,
            dataProvider,
            draft: draft ?? false,
            children: withDataProviderProps,
          }),
        );
      } catch (error) {
        // Inline mode awaits the provider *before* `wrap` builds the injected
        // error boundary, so a provider (or `consumeProviderTags`) rejection
        // throws here and would escape that boundary and crash the whole page
        // render — unlike the streaming path below, where the boundary wraps
        // the still-pending `<DataProviderPropsBlock>` element and catches it.
        // Restore that per-block isolation: boundary-wrapped custom blocks
        // degrade to nothing (the injected boundary renders `null`), while
        // core/structural blocks keep propagating exactly as they do unwrapped.
        if (blockErrorBoundary && isCustomBlock) {
          // Log before swallowing: this catch bypasses the injected boundary's
          // own `onError` (PostHog capture / red alert), so without this the
          // failure would be invisible in production. Server-side only — the
          // inline error never reaches a client boundary because nothing
          // streams. `console.error` matches this render path's convention.
          console.error(
            `[chai-render] data provider for block "${block._type}" (${block._id}) failed; degrading block to null`,
            { slug: pageProps?.slug, error },
          );
          return null;
        }
        throw error;
      }
    }

    return wrap(
      // Server skeletons get the block props so they can reserve the resolved
      // block's height instead of a zero-height placeholder (layout shift).
      <Suspense fallback={createElement(suspenseFallback, isClientReference(suspenseFallback) ? undefined : blockProps)}>
        <DataProviderPropsBlock
          lang={lang ?? ""}
          pageProps={pageProps as ChaiPageProps}
          block={newBlock}
          dataProvider={dataProvider}
          draft={draft ?? false}>
          {withDataProviderProps}
        </DataProviderPropsBlock>
      </Suspense>,
    );
  }

  const rendered = createElement(Component, { ...blockProps }, blockChildren());

  // In inline mode there must be no boundary between the page root and any
  // descendant data-provider block: a `<Suspense>` here (even bare, with a
  // null fallback) would catch a child block that is still awaiting its
  // provider and stream it into a hidden `<div hidden id="S:n">` container —
  // exactly what inline mode exists to prevent.
  if (shouldInlineDataProviders()) {
    return wrap(rendered);
  }

  return wrap(<Suspense>{rendered}</Suspense>);
};
