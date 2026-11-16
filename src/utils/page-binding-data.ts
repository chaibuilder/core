import type { ChaiPageProps } from "~/types/common";

export type ChaiBindingPageData = {
  /** Last path segment (the dynamic item slug on dynamic pages). */
  slug: string;
  /** Full path of the rendered page. */
  path: string;
  /** Path of the page template (`pageBaseSlug`), or `path` on static pages. */
  basePath: string;
  pathWithParams: string;
  querySeparator: "?" | "&";
};

/**
 * The `page` object exposed to `{{page.*}}` bindings. Built from the request's
 * `pageProps` on both the render path and the builder canvas so a binding
 * resolves the same in both. Page-type data providers may also return a
 * `page` key; this object is merged over it.
 */
export const buildPageBindingData = (pageProps: ChaiPageProps): ChaiBindingPageData => {
  const path = pageProps.slug ?? "";
  const slugParts = path.split("/").filter(Boolean);
  const slug = slugParts[slugParts.length - 1] ?? "";

  const queryString = pageProps.searchParams ? new URLSearchParams(pageProps.searchParams).toString() : "";
  const hasQuery = queryString.length > 0;

  return {
    slug,
    path,
    pathWithParams: hasQuery ? `${path}?${queryString}` : path,
    querySeparator: hasQuery ? "&" : "?",
    basePath: pageProps.pageBaseSlug ?? path,
  };
};
