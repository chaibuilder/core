import { get, isEmpty } from "lodash-es";
import { cache } from "react";
import { resolveConfigPageNotFound } from "~/server/defaults/config-registry";
import { getFrameworkAdapter } from "~/server/framework-adapter";
import { runChaiRequestMiddleware } from "~/server/plugin-api/request-middleware";
import { ChaiBlock } from "~/types";
import type { ChaiFullPage } from "~/types/pages";
import { getFallbackLang } from "../internal/init";
import { getInitializedState } from "../state";
import { withRequestCache } from "./cache-utils";
import { getAlternateLangPages } from "./get-alternate-lang-pages";
import { getBreadcrumb } from "./get-breadcrumb";
import { getFullPage } from "./get-full-page";
import { getPageGlobalJSONLds } from "./get-page-global-jsonlds";
import { resolvePageBySlug } from "./get-page-by-slug";
import { getPageDetails } from "./get-page-details";
import { getPartialPageBySlug } from "./get-partial-page-by-slug";
import { getSiteSettings } from "./get-site-settings";
import { registerCacheTags } from "./register-cache-tags";
import type { PageRoutingMetadata } from "./page-routing-cache";

/**
 * The SEO editor persists an "empty" JSON-LD as the string `"{}"` (or `"[]"`),
 * which `isEmpty` treats as non-empty. Treat those sentinels as empty so a
 * language page still inherits the primary page's JSON-LD.
 */
const isEmptyJsonLD = (value: unknown): boolean =>
  isEmpty(value) || (typeof value === "string" && ["", "{}", "[]"].includes(value.trim()));

async function fetchPageMetadata(page: PageRoutingMetadata, fallbackLang: string): Promise<ChaiFullPage> {
  const primaryPageId = page.primaryPage ?? page.id;
  // Resolve the site fallback BEFORE fetching alternate-language pages: the primary page
  // stores an empty `lang`, so the alternate hreflang labels must derive from the site's
  // real fallback — not the request-state default, which is only the hardcoded "en"
  // placeholder on the metadata request path. Mislabeling the French primary as `en`
  // overwrites the English variant's self-hreflang with the French URL.
  const siteSettings = await getSiteSettings();
  const finalFallbackLang = siteSettings?.fallbackLang || fallbackLang;
  const [details, alternatePages] = await Promise.all([
    getPageDetails(page.id),
    getAlternateLangPages(primaryPageId, page.id, finalFallbackLang),
  ]);

  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    lang: page.lang || finalFallbackLang,
    primaryPage: page.primaryPage,
    seo: details.seo ?? {},
    currentEditor: details.currentEditor,
    pageType: page.pageType!,
    lastSaved: details.lastSaved!,
    dynamic: page.dynamic!,
    dynamicSlugCustom: page.dynamicSlugCustom,
    parent: page.parent,
    blocks: [],
    fallbackLang: finalFallbackLang,
    breadcrumb: [],
    alternatePages,
    tracking: details.tracking,
    metadata: details.metadata ?? {},
  };
}

async function fetchPageData(page: PageRoutingMetadata, fallbackLang: string): Promise<ChaiFullPage> {
  const primaryPageId = page.primaryPage ?? page.id;
  // See fetchPageMetadata: resolve the site fallback before fetching alternate-language
  // pages so `currentLang` and the hreflang labels use the site's real fallback, not the
  // request-state "en" default. `currentLang` also drives globalJsonLds resolution below.
  const siteSettings = await getSiteSettings();
  const finalFallbackLang = siteSettings?.fallbackLang || fallbackLang;
  const currentLang = page.lang || finalFallbackLang;
  // A language/alternate page references a distinct primary page; it inherits
  // that primary's shared JSON-LD (staging getFullPage.ts:69-74).
  const isLanguagePage = !!page.primaryPage && page.primaryPage !== page.id;
  const [fullPage, details, primaryDetails, breadcrumbPages, alternatePages] = await Promise.all([
    getFullPage(primaryPageId, { mergePartials: true }),
    getPageDetails(page.id),
    isLanguagePage ? getPageDetails(primaryPageId) : Promise.resolve(null),
    getBreadcrumb(page.id),
    getAlternateLangPages(primaryPageId, page.id, finalFallbackLang),
  ]);
  const blocks = fullPage.blocks as ChaiBlock[];

  // Resolve the page's shared JSON-LD id references (globalJsonLds) into their
  // actual documents — the Car/Vehicle + AutomotiveBusiness/AutoDealer schemas
  // the routes render via `globalJsonLdsData`. Language pages inherit the
  // primary's global refs, and its seo.jsonLD when they have none of their own.
  let seo = (details.seo ?? {}) as Record<string, unknown>;
  let globalJsonLdIds = details.globalJsonLds ?? [];
  if (primaryDetails) {
    globalJsonLdIds = primaryDetails.globalJsonLds ?? [];
    if (isEmptyJsonLD(get(seo, "jsonLD"))) {
      seo = { ...seo, jsonLD: get(primaryDetails.seo, "jsonLD") ?? {} };
    }
  }
  const globalJsonLdsData = await getPageGlobalJSONLds(globalJsonLdIds, currentLang);

  // Tag this route with every partial merged into it, so publishing a partial
  // (which emits `page-<partialId>`) invalidates its consumer pages. Must run
  // outside getFullPage's persistent cache — nested tags don't propagate.
  await registerCacheTags((fullPage.partialIds ?? []).map((id) => `page-${id}`));

  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    lang: page.lang || finalFallbackLang,
    primaryPage: page.primaryPage,
    seo,
    currentEditor: details.currentEditor,
    pageType: page.pageType!,
    lastSaved: details.lastSaved!,
    dynamic: page.dynamic!,
    dynamicSlugCustom: page.dynamicSlugCustom,
    parent: page.parent,
    blocks,
    fallbackLang: finalFallbackLang,
    breadcrumb: breadcrumbPages,
    alternatePages,
    tracking: details.tracking,
    metadata: details.metadata ?? {},
    globalJsonLdsData,
  };
}

const resolvePageMatch = cache(async (slug: string): Promise<PageRoutingMetadata> => {
  getInitializedState();
  return resolvePageBySlug(slug);
});

/**
 * No page resolved for this slug. Stored redirects get first refusal; if none matches, the
 * app's `onPageNotFound` handler decides; otherwise the 404 stands.
 *
 * Redirects are thrown outside the cached lookup - the framework's redirect signal must
 * never be serialized into a cache entry.
 */
async function redirectOrNotFound(slug: string): Promise<never> {
  const adapter = getFrameworkAdapter();
  const state = getInitializedState();

  const lang = state.lang || (await getFallbackLang());
  const redirect = await runChaiRequestMiddleware({ slug, lang });
  if (redirect && redirect.redirect !== slug) {
    return adapter.redirect(redirect.redirect, redirect.permanent);
  }

  const handled = await resolveConfigPageNotFound({
    slug,
    appId: state.appId!,
    lang,
    draft: state.draftMode,
  });
  if (handled) {
    return adapter.redirect(handled.redirect, handled.permanent);
  }

  return adapter.pageNotFound();
}

export const getPageForMetadata = cache(async (slug: string): Promise<ChaiFullPage> => {
  if (slug.startsWith("/_partial/")) {
    return (await getPartialPageBySlug(slug)) as unknown as ChaiFullPage;
  }

  const state = getInitializedState();

  try {
    const page = await resolvePageMatch(slug);
    return await withRequestCache(fetchPageMetadata, "fetchPageMetadata")(page, await getFallbackLang());
  } catch (error) {
    if (error instanceof Error && error.message === "PAGE_NOT_FOUND") {
      await redirectOrNotFound(slug);
    }
    throw error;
  }
});

export const getPage = cache(async (slug: string): Promise<ChaiFullPage> => {
  if (slug.startsWith("/_partial/")) {
    return (await getPartialPageBySlug(slug)) as unknown as ChaiFullPage;
  }

  const state = getInitializedState();

  try {
    const page = await resolvePageMatch(slug);
    return await withRequestCache(fetchPageData, "fetchPageData")(page, await getFallbackLang());
  } catch (error) {
    if (error instanceof Error && error.message === "PAGE_NOT_FOUND") {
      await redirectOrNotFound(slug);
    }
    throw error;
  }
});
