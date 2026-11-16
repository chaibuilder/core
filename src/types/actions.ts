import type { StreamTextResult } from "ai";
import type { ChaiPageTypeDataProvider } from "~/types/chaibuilder-config";
import type { ChaiBlock } from "~/types/common";
import type { ChaiTheme } from "./chaibuilder-editor-props";
import type { ChaiDesignTokens } from "./types";

export type ChaiWebsiteSetting = {
  appKey: string;
  fallbackLang: string;
  languages: string[];
  theme: ChaiTheme;
  settings: Record<string, any>;
  designTokens: ChaiDesignTokens;
  appChanges?: string[];
  consentConfig?: Record<string, any>;
  configData?: Record<string, any>;
};

type ChaiPageSeo = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  jsonLD?: string;
};

export type ChaiPage = {
  id: string;
  slug: string;
  lang: string;
  name: string;
  pageType: string;
  blocks: ChaiBlock[];
  createdAt: string;
  lastSaved: string;
  dynamic: boolean;
  online: boolean;
  seo: ChaiPageSeo;
  app: string;
  primaryPage?: string | null;
  currentEditor?: string | null;
  changes: object[];
  parent?: string | null;
  libRefId?: string | null;
  dynamicSlugCustom?: string | null;
  metadata?: object;
  jsonld?: object;
  globalJsonLds?: string[];
  links?: string;
  partialBlocks?: string;
  designTokens?: ChaiDesignTokens;
  tracking?: Record<string, any> | null;
  /** The upstream page this page renders while `useUpstream` is on. */
  upstream?: string | null;
  useUpstream?: boolean;
};

/**
 * A dynamic item a page type can render. `slug` builds the preview URL;
 * `identifier` is what the page type's data provider looks the item up by —
 * the two differ whenever items are keyed by something other than a slug.
 */
export type ChaiDynamicPageSummary = Pick<ChaiPage, "id" | "name" | "slug" | "primaryPage"> & {
  identifier?: string;
};

export type ChaiPageType = {
  key: string;
  helpText?: string;
  description?: string; // AI-facing description of this page type and its data
  hasSlug?: boolean;
  icon?: string;
  name: string | (() => Promise<string>);
  pluralName?: string | (() => Promise<string>);
  dynamicSegments?: string;
  dynamicSlug?: string;
  getDynamicPages?: ({
    query,
    identifier,
    slug,
    lang,
    pageSlug,
  }: {
    query?: string;
    /** Look up a single item by its exact identifier (id, slug, path, ...). */
    identifier?: string;
    /** @deprecated Use `identifier` — kept for callers written before the rename. */
    slug?: string;
    lang: string;
    /**
     * Slug of the builder page the picker is open on. Two pages of the same page
     * type can scope different collections (e.g. new vs used vehicle detail pages).
     */
    pageSlug?: string;
  }) => Promise<ChaiDynamicPageSummary[]>;
  /**
   * Serialized for the client only — functions never cross the wire, so the builder
   * relies on this to know whether `getDynamicPages` exists. Absent means "assume it does".
   */
  hasGetDynamicPages?: boolean;
  search?: (query: string) => Promise<Pick<ChaiPage, "id" | "name" | "slug">[] | Error>;
  resolveLink?: (id: string, draft?: boolean, lang?: string) => Promise<string>;
  /**
   * URL to open in an iframe panel when editing a dynamic page item.
   * Use {{ID}} as placeholder for the page id.
   * e.g. "/admin/embed/collections/posts/{{ID}}"
   */
  editUrl?: string;
  /**
   * URL to open in an iframe panel when creating a new dynamic page item.
   * Plain URL, no placeholder needed.
   * e.g. "/admin/embed/collections/posts/create"
   */
  createUrl?: string;
  onCreate?: (data: Partial<ChaiPage> & { id: string }) => Promise<void>;
  onUpdate?: (data: Partial<ChaiPage> & { id: string }) => Promise<void>;
  onDelete?: (data: Pick<ChaiPage, "id">) => Promise<void>;

  // page data
  dataProvider?: ChaiPageTypeDataProvider;

  //extra options
  defaultSeo?: () => Record<string, any>;
  defaultJSONLD?: () => Record<string, any>;
  defaultMetaTags?: () => Record<string, string>;
  defaultTrackingInfo?: () => Record<string, any>;
};

export interface ChaiLoggedInUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role?: string;
}

export type ChaiUserInfo = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
};

export type ChaiAsset = {
  id: string;
  name: string;
  url: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  size?: number;
  folderId: string | null;

  // Optional
  thumbnailUrl?: string;
  description?: string;
  duration?: number;
  format?: string;

  width?: number;
  height?: number;
};

export type AssetsParams = {
  search: string;
  limit: number;
  page: number;
};

export type ImageConfig = {
  lastImage?: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  quality?: number;
};

export type AIChatOptions = {
  messages: any[];
  image?: ImageConfig;
  systemPrompt?: string;
  initiator?: string | null;
  model?: string;
  context?: AIContext;
  designTokens?: ChaiDesignTokens;
  images?: string[];
  attachments?: { url?: string; mediaType?: string; filename?: string }[];
  options?: Record<string, any>;
};

export type AIContext = {
  site?: Record<string, any>;
  page?: Record<string, any>;
};

export interface ChaiBuilderPagesAIInterface {
  handleRequest(options: AIChatOptions, res: any): Promise<StreamTextResult<any, any>>;
  isConfigured(): boolean;
}
