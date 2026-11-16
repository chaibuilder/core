import type { ChaiPage } from "~/types/actions";

export type ChaiPartialPage = {
  id: string;
  languagePageId: string;
  lang: string;
  pageType: string;
  slug: string;
  fallbackLang: string;
};

export type ChaiFullPage = {
  fallbackLang: string;
  breadcrumb: Array<Pick<ChaiPage, "id" | "name" | "slug" | "lang">>;
  alternatePages: Array<Pick<ChaiPage, "id" | "name" | "slug" | "lang"> & { primaryLang: boolean }>;
  globalJsonLdsData?: any[];
  tracking?: unknown;
  /** Set when the blocks and SEO came from this upstream page (a linked page). */
  upstream?: string | null;
} & Pick<
  ChaiPage,
  | "id"
  | "name"
  | "slug"
  | "lang"
  | "primaryPage"
  | "seo"
  | "currentEditor"
  | "pageType"
  | "lastSaved"
  | "dynamic"
  | "dynamicSlugCustom"
  | "parent"
  | "blocks"
  | "metadata"
>;
