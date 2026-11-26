import React from "react";
import { ChaiBlock, ChaiBlockSchema, ChaiBlockUiSchema, ChaiPageProps } from "./common";
import type { ChaiDesignTokens } from "./types";

export type ChaiBlockComponentProps<
  BlockProps = unknown,
  PageData = Record<string, unknown>,
> = ChaiBlock<BlockProps> & {
  // Chai Block Props
  $loading?: boolean;
  blockProps: Record<string, string>;
  inBuilder: boolean;
  lang: string;
  draft: boolean;
  pageProps?: ChaiPageProps;
  pageData?: PageData;
  /** Site design tokens, resolved with `resolveDesignToken` (works in RSC). */
  designTokens?: ChaiDesignTokens;
  //React Node
  children?: React.ReactNode;
};

export type ChaiStyles = {
  [key: string]: string;
};

/**
 * A registered block variant. Every key is optional; a variant with none of them
 * is just a named entry in the dropdown.
 */
export type ChaiBlockVariant = {
  /** Replaces the default component. Omit to render the default one. */
  component?: React.ComponentType<ChaiBlockComponentProps<any>>;
  /**
   * Props written into the block when this variant is picked. Style props take a
   * class string (or a full `#styles:base,classes` string); others are written verbatim.
   */
  props?: Record<string, unknown>;
  /** What this variant is for. */
  description?: string;
  /** Image URL for this variant's own Library card. Omit to list it in the dropdown only. */
  preview?: string;
};

export type ChaiAsyncProp<T> = T | undefined;
export type ChaiClosestBlockProp<T> = T | undefined;
export type ChaiDataProviderArgs<T = Record<string, any>, K = Record<string, any>> = {
  block: ChaiBlock<T>;
} & K;

/**
 * Result of a block data provider. May include `$cacheTags`: cache tags
 * registered on the consuming route during live render, so external data
 * changes can invalidate the pages that used the data via `revalidateTag`.
 * The key is always stripped before the result reaches the block, and never
 * registered in the builder or in draft mode. Tags must be tenant-scoped
 * (include the app/company id).
 */
export type ChaiDataProviderResult = Record<string, unknown> & {
  $cacheTags?: string[];
};

export interface ChaiBlockConfig {
  // required
  type: string;
  label: string;
  group: string;

  // optional
  description?: string;
  wrapper?: boolean;
  blocks?: ChaiBlock[] | (() => ChaiBlock[]);
  category?: string;
  hidden?: boolean | ((parentType?: string) => boolean);
  icon?: React.ReactNode | React.ComponentType;
  /**
   * Restricts this block to specific page types (matched against `ChaiPage.pageType`).
   * Omit to make the block available on every page type.
   */
  pageTypes?: string[];
  /**
   * List this block in the Add Block panel's Library tab instead of the Blocks tab.
   * Defaults to `false`. It is grouped there by `group`, alongside the registered
   * libraries' blocks.
   */
  showInLibrary?: boolean;
  /** Image URL shown as the block's card in the Library tab. Used with `showInLibrary`. */
  preview?: string;
  /**
   * Arbitrary host-defined metadata stored on the block config. Chai never reads
   * it; host code (such as `canShowBlock`) can inspect it.
   */
  metadata?: Record<string, unknown>;

  dataProviderMode?: "live" | "mock";
  dataProviderDependencies?: string[];
  dataProvider?: (args: {
    lang: string;
    draft: boolean;
    inBuilder: boolean;
    block: ChaiBlock;
    pageProps: ChaiPageProps;
  }) => ChaiDataProviderResult | Promise<ChaiDataProviderResult>;

  //props
  props?: {
    schema: ChaiBlockSchema;
    uiSchema: ChaiBlockUiSchema;
  };

  /**
   * Named visual variants of this block, chosen per block instance via the
   * reserved `_variant` key, which the editor exposes as a "Variant" dropdown.
   * Each variant is a `{ component?, props?, description?, preview? }` object:
   *
   * - `component` swaps the rendered component; it receives the exact same props
   *   as the default one. Pass lazy wrappers,
   *   `next/dynamic(() => import("./variant"))`, so variants that are never
   *   rendered cost nothing; a static import makes the variant eager.
   * - `props` is written into the block when the variant is picked, e.g.
   *   `{ styles: "border p-6", ctaType: "email" }`. Switching variants resets
   *   every prop any variant controls back to its schema default first.
   *
   * Re-registering a type without this key keeps previously registered variants;
   * pass an empty object to clear them.
   */
  variants?: Record<string, ChaiBlockVariant>;

  i18nProps?: string[];
  /**
   * `i18nProps` whose blank translation renders as unset instead of the
   * fallback-language value: the block supplies its own per-language default.
   */
  i18nDefaultProps?: string[];
  aiProps?: string[];
  inlineEditProps?: string[];

  /**
   * Props this block stops rendering once it has child blocks — a Heading with a
   * Span inside it renders the children and drops `content`. The settings panel
   * hides them for such an instance so the form only offers props that still
   * have an effect. Stored values are left untouched, so removing the children
   * brings the prop (and its value) back.
   */
  childrenOverrideProps?: string[];

  /**
   * How deep in the page tree this block may be inserted. A root block is at
   * depth 0, so `0` means "top level only" and `N` means "at most N levels
   * deep". Omitted or `-1` means no limit.
   *
   * When a block is added from the selection (panel click, paste, AI), the
   * placement walks up past any ancestor that would put it too deep and inserts
   * it right after the ancestor it climbed out of. `canAcceptBlock` and
   * `canBeNested` still apply. Moving an existing block is not checked. A
   * `ChaiSlot` takes any block its owner's `chaiSlot({ accept })` allows at any
   * depth: the owner made room for it there.
   */
  maxDepth?: number;

  // callbacks
  canAcceptBlock?: (type: string) => boolean;
  canDelete?: () => boolean;
  canMove?: () => boolean;
  canDuplicate?: () => boolean;
  canBeNested?: (type: string) => boolean;
}

export interface ChaiServerBlockConfig {
  component: React.ComponentType<ChaiBlockComponentProps>;
  type: string;
  dataProvider?: (args: {
    draft: boolean;
    inBuilder: boolean;
    lang: string;
    block: ChaiBlock;
    pageProps: ChaiPageProps;
  }) => Promise<ChaiDataProviderResult>;
  suspenseFallback?: React.ComponentType<any>;
}
