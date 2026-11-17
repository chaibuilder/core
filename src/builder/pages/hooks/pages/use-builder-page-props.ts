import { useMemo } from "react";
import { useChaiActivePage, usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useDynamicPageIdentifier, useDynamicPageSlug } from "./use-dynamic-page-selector";

/**
 * The builder's mirror of the public render path's `pageProps`. Sent to server data
 * providers and exposed under `pageProps` in the page external data, so a
 * `{{pageProps.slug}}` binding resolves the same on the canvas and at runtime.
 */
export const useBuilderPageProps = () => {
  const { data: primaryPage } = usePrimaryPage();
  const { data: activePage } = useChaiActivePage();
  const fallbackLang = useChaiFallbackLang();
  const dynamicPageSlug = useDynamicPageSlug();
  const dynamicPageIdentifier = useDynamicPageIdentifier();

  return useMemo(
    () => ({
      slug: (activePage?.slug ?? "") + (dynamicPageSlug ? `/${dynamicPageSlug}` : ""),
      pageIdentifier: dynamicPageIdentifier,
      searchParams: {},
      pageType: activePage?.pageType,
      fallbackLang,
      lastSaved: activePage?.lastSaved,
      pageId: primaryPage?.id,
      primaryPageId: activePage?.primaryPage || primaryPage?.id,
      pageBaseSlug: activePage?.slug,
      dynamic: primaryPage?.dynamic,
      languagePageId: activePage?.id,
      metadata: primaryPage?.metadata || {},
    }),
    [activePage, primaryPage, fallbackLang, dynamicPageSlug, dynamicPageIdentifier],
  );
};
