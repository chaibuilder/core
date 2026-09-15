import { isEmpty, isPlainObject } from "lodash-es";
import type { ReactNode } from "react";
import { setChaiBlockComponent } from "~/registry";
import { ChaiBlockComponentProps, ChaiDesignTokens, ChaiPageProps, ChaiStyles } from "~/types";
import type { ChaiFullPage } from "~/types/pages";
import { applyDesignTokens } from "~/utils";
import { buildPageBindingData } from "~/utils/page-binding-data";
import { BlockErrorBoundaryComponent, RenderChaiBlocksSDK } from "../render-chai-blocks-sdk";
import { ButtonBlock } from "./button-block";
import { ImageBlock } from "./image-block";
import { LinkBlock } from "./link-block";

// TODO: Keep this NextJSRenderChaiBlocks implementation functionally aligned with the RSC
// version in render-chai-blocks.tsx:
// https://github.com/chaibuilder/frameworks/blob/main/packages/next/src/blocks/rsc/render-chai-blocks.tsx
// (e.g., sync new props including `slot`/`slots`, block registrations, and rendering behavior when that file changes).
type ButtonBlockProps = {
  styles: ChaiStyles;
  content: string;
  icon: string;
  iconSize: number;
  iconPos: "order-first" | "order-last";
  link: {
    type: "page" | "pageType" | "url" | "email" | "telephone" | "element";
    target: "_self" | "_blank";
    href: string;
  };
  prefetchLink?: boolean;
};

type ImageBlockProps = {
  height: string;
  width: string;
  alt: string;
  styles: ChaiStyles;
  lazyLoading: boolean;
  image: string;
};

type LinkBlockProps = {
  styles: ChaiStyles;
  content: string;
  link: {
    type: "page" | "pageType" | "url" | "email" | "telephone" | "element";
    target: "_self" | "_blank";
    href: string;
  };
  prefetchLink?: boolean;
};

type ComponentType<T> = React.ComponentType<T> | Promise<React.ComponentType<T>>;

export const NextJSRenderChaiBlocks = async ({
  pageData,
  settings,
  page,
  pageProps,
  linkComponent = LinkBlock,
  imageComponent = ImageBlock,
  buttonComponent = ButtonBlock,
  designTokens = {},
  withRenderPhase,
  dataProviders,
  slot,
  slots,
  blockErrorBoundary,
  draft,
}: {
  pageData: Record<string, any>;
  settings: Record<string, any> & { designTokens?: ChaiDesignTokens };
  page: ChaiFullPage;
  pageProps: ChaiPageProps;
  designTokens?: ChaiDesignTokens;
  linkComponent?: ComponentType<ChaiBlockComponentProps<LinkBlockProps>>;
  imageComponent?: ComponentType<ChaiBlockComponentProps<ImageBlockProps>>;
  buttonComponent?: ComponentType<ChaiBlockComponentProps<ButtonBlockProps>>;
  withRenderPhase?: <T>(label: string, fn: () => T | Promise<T>, detail?: string) => Promise<T>;
  // Optional precomputed per-block data-provider promises (batched fetching).
  dataProviders?: Record<string, Promise<Record<string, any>>>;
  /** React children injected at the default (unnamed) `PageSlot`. */
  slot?: ReactNode;
  /** Named slot content keyed by PageSlot `slotName`. */
  slots?: Record<string, ReactNode>;
  // Optional app-provided per-block error boundary (see BlockErrorBoundaryComponent).
  blockErrorBoundary?: BlockErrorBoundaryComponent;
  /** Draft mode for block data providers (e.g. Next.js `draftMode().isEnabled`). */
  draft?: boolean;
}) => {
  const phase =
    withRenderPhase ??
    (async <T,>(_label: string, fn: () => T | Promise<T>) => fn());

  await phase("RenderChaiBlocks.registerComponents", async () => {
    setChaiBlockComponent("Link", await linkComponent);
    setChaiBlockComponent("Image", await imageComponent);
    setChaiBlockComponent("Button", await buttonComponent);
  });

  const tokens = settings?.designTokens ?? designTokens;
  const blockCount = page.blocks?.length ?? 0;

  const blocks = await phase(
    "RenderChaiBlocks.applyDesignTokens",
    async () => (!isEmpty(tokens) ? applyDesignTokens(page.blocks, tokens) : page.blocks),
    `blocks=${blockCount}`,
  );

  return phase(
    "RenderChaiBlocks.renderSDK",
    async () => (
      <RenderChaiBlocksSDK
        externalData={{
          ...pageData,
          page: { ...(isPlainObject(pageData.page) ? (pageData.page as Record<string, unknown>) : {}), ...buildPageBindingData(pageProps) },
        }}
        designTokens={tokens}
        blocks={blocks}
        fallbackLang={settings?.fallbackLang}
        lang={page.lang}
        pageProps={pageProps}
        dataProviders={dataProviders}
        slot={slot}
        slots={slots}
        blockErrorBoundary={blockErrorBoundary}
        draft={draft}
      />
    ),
    `blocks=${blockCount}`,
  );
};
