import { cache } from "react";
import { ChaiPageProps } from "~/types";
import type { ChaiFullPage } from "~/types/pages";
import { setFallbackLang, setLang } from "../internal/init";
import { getPage } from "./get-page";
import { getPageData } from "./get-page-data";
import { getSiteSettings } from "./get-site-settings";
import { resolveLinksInPageBlocks } from "./resolve-links-batch";

export const getPagePayload = cache(
  async (slug: string, customPageProps?: (page: ChaiFullPage, settings: any) => Partial<ChaiPageProps>) => {
    const [page, settings] = await Promise.all([getPage(slug), getSiteSettings()]);
    setLang(page.lang);
    // Seed the request state so later readers skip the site-settings lookup in
    // getFallbackLang().
    setFallbackLang(page.fallbackLang);
    const basePageProps: ChaiPageProps = {
      slug,
      pageType: page.pageType,
      fallbackLang: page.fallbackLang,
      pageLang: page.lang,
      dynamic: page.dynamic,
      dynamicSlugCustom: page.dynamicSlugCustom,
      pageBaseSlug: page.slug,
      pageId: page.id,
      primaryPageId: page.primaryPage || page.id,
      languagePageId: page.id,
    };

    const pageProps: ChaiPageProps = customPageProps
      ? { ...basePageProps, ...customPageProps(page, settings) }
      : basePageProps;

    const resolvedBlocks = await resolveLinksInPageBlocks(page);

    const pageData = await getPageData({
      blocks: resolvedBlocks,
      pageProps,
      pageType: page.pageType,
      lang: page.lang,
    });

    return { page: { ...page, blocks: resolvedBlocks }, settings, pageData, pageProps };
  },
);
