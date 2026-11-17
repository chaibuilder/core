import { isEmpty } from "lodash-es";
import { registerChaiBlockComponent } from "~/registry";
import type { ChaiFullPage } from "~/types/pages";
import { ChaiBlockComponentProps, ChaiDesignTokens, ChaiPageProps, ChaiStyles } from "~/types";
import { applyChaiDesignTokens } from "~/utils";
import { RenderChaiBlocksSDK } from "../render-chai-blocks-sdk";
import { GenericButtonBlock } from "./button-block";
import { GenericImageBlock } from "./image-block";
import { GenericLinkBlock } from "./link-block";

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

export const GenericRenderChaiBlocks = async ({
  pageData,
  settings,
  page,
  pageProps,
  linkComponent = GenericLinkBlock,
  imageComponent = GenericImageBlock,
  buttonComponent = GenericButtonBlock,
  designTokens = {},
  withRenderPhase,
  dataProviders,
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
  dataProviders?: Record<string, Promise<Record<string, any>>>;
}) => {
  const phase = withRenderPhase ?? (async <T,>(_label: string, fn: () => T | Promise<T>) => fn());

  await phase("RenderChaiBlocks.registerComponents", async () => {
    registerChaiBlockComponent("Link", await linkComponent);
    registerChaiBlockComponent("Image", await imageComponent);
    registerChaiBlockComponent("Button", await buttonComponent);
  });

  const tokens = settings?.designTokens ?? designTokens;
  const blockCount = page.blocks?.length ?? 0;

  const blocks = await phase(
    "RenderChaiBlocks.applyDesignTokens",
    async () => (!isEmpty(tokens) ? applyChaiDesignTokens(page.blocks, tokens) : page.blocks),
    `blocks=${blockCount}`,
  );

  return phase(
    "RenderChaiBlocks.renderSDK",
    async () => (
      <RenderChaiBlocksSDK
        externalData={pageData}
        designTokens={tokens}
        blocks={blocks}
        fallbackLang={settings?.fallbackLang}
        lang={page.lang}
        pageProps={pageProps}
        dataProviders={dataProviders}
      />
    ),
    `blocks=${blockCount}`,
  );
};
