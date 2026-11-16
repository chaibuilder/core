import { get } from "lodash-es";
import type { ChaiPageMetadata } from "~/types/page-metadata";
import { getSiteUrl } from "~/server/chai-builder/internal/init";
import type { ChaiFullPage } from "~/types/pages";
import { applyChaiDataBinding } from "~/utils";

// The binding engine escapes resolved values for HTML contexts, but metadata is
// plain text: `&amp;` bound into a title renders literally in the browser tab.
// Undo exactly the five entities the engine's escaper produces.
const ESCAPED_ENTITY = /&(amp|lt|gt|quot|#39);/g;
const ENTITY_CHARS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

const decodeEntities = (value: unknown): unknown =>
  typeof value === "string" ? value.replace(ESCAPED_ENTITY, (_, name) => ENTITY_CHARS[name]) : value;

/**
 * Fallback OG image when the page has no explicit `seo.ogImage`, mirroring the
 * app builder: the site logo by default, the lead vehicle image for vehicle
 * page types, and the promotion image for promotion pages. Without this the
 * page emits no `og:image` at all — which also downgrades `twitter:card` to
 * `summary`, since Next derives the card from `openGraph.images.length`.
 */
// `vehicle.images` is stored as a JSON array in some records and a comma-separated
// string in others; normalize both to a list so neither shape silently drops images.
const parseImageList = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
};

const resolveFallbackOgImage = (page: ChaiFullPage, pageData: Record<string, unknown>, siteUrl: string): string => {
  const logo = siteUrl ? `${siteUrl}/logo.png` : "/logo.png";
  const pageType = (page as { pageType?: string })?.pageType;
  try {
    if (pageType === "vdp_page" || pageType === "showroom_vdp" || pageType === "trim_page") {
      const vehicle = get(pageData, "vehicle") ?? get(pageData, "model");
      const imgs = parseImageList(get(vehicle, "images"));
      if (imgs.length > 0 && imgs[0]) return imgs[0] as string;
      // No usable images (missing OR an empty `[]`/`"[]"`) — fall back to the
      // version's own image before dropping all the way to the site logo.
      const versionImage = get(pageData, "version.image");
      if (typeof versionImage === "string" && versionImage) return versionImage;
    } else if (pageType === "promotion_vdp") {
      const promotion = get(pageData, "promotion");
      const promoImage = get(promotion, "vehicle.image") ?? get(promotion, "image");
      if (typeof promoImage === "string" && promoImage) return promoImage;
    } else {
      const globalOgImage = (pageData?.global as any)?.seo?.image;
      if (globalOgImage) return globalOgImage as string;
    }
  } catch {
    // fall back to the logo on any parse error
  }
  return logo;
};

/** OG locale (e.g. `fr_CA`) from a language tag, mirroring the app builder. */
const getOgLocale = (lang?: string): string | undefined => {
  if (!lang) return undefined;
  if (lang === "en") return "en_CA";
  if (lang === "fr") return "fr_CA";
  const [language, region] = lang.replace("_", "-").split("-");
  if (language && region) return `${language}_${region.toUpperCase()}`;
  return undefined;
};

type MetadataTransform = (
  metadata: ChaiPageMetadata,
  context: {
    page: ChaiFullPage;
    pageData: Record<string, unknown>;
    settings: Record<string, unknown>;
    seo: Record<string, any>;
  },
) => ChaiPageMetadata;

export const generateMetaData = (
  params: {
    page: ChaiFullPage;
    pageData: Record<string, unknown>;
    settings: Record<string, unknown>;
    /** The slug actually requested. For dynamic pages this carries the resolved
     * segment (`/docs/introduction`), while `page.slug` is only the template (`/docs`). */
    slug?: string;
    /** When true, force `noindex, nofollow` regardless of per-page SEO (the app
     * threads its `DISALLOW_INDEXING` env here so preview deploys stay unindexed). */
    disallowIndexing?: boolean;
  },
  transform?: MetadataTransform,
) => {
  const boundSeo = applyChaiDataBinding(params.page?.seo ?? {}, params.pageData);
  const seo = Object.fromEntries(
    Object.entries(boundSeo).map(([key, value]) => [
      key,
      key === "metaOther" || key === "jsonLD" ? value : decodeEntities(value),
    ]),
  ) as Record<string, any>;
  const { alternatePages = [], fallbackLang, lang, slug } = params.page;
  const siteUrl = getSiteUrl()?.replace(/\/$/, "") ?? "";

  // On a dynamic page the requested path is the template slug plus the resolved
  // segment (`/docs` + `/introduction`). Alternate pages only store the template
  // half, so the segment has to be carried over or every language points at `/docs`.
  const requestedSlug = params.slug ?? slug;
  const dynamicSegment = params.page?.dynamic && requestedSlug.startsWith(slug) ? requestedSlug.slice(slug.length) : "";

  // The current page's own path — for dynamic pages the resolved request path,
  // and for a language variant its OWN slug (e.g. `/en/about`), NOT the primary
  // page's. This drives both the self-hreflang and the canonical, matching
  // staging's self-canonical behavior: a language variant that canonicalizes to
  // the primary would be de-indexed as a duplicate and emit a self-hreflang
  // pointing at the wrong-language URL.
  const defaultPath = requestedSlug;

  const languages: Record<string, string> = {};
  // Self-referential hreflang: a page always advertises its OWN language, matching
  // the app builder. `alternatePages` only holds the OTHER languages, so without
  // this a page with no alternate emitted no hreflang at all.
  if (lang) {
    languages[lang] = siteUrl ? `${siteUrl}${defaultPath}` : defaultPath;
  }
  for (const alt of alternatePages) {
    if (alt.lang) {
      const altSlug = `${alt.slug}${dynamicSegment}`;
      languages[alt.lang] = siteUrl ? `${siteUrl}${altSlug}` : altSlug;
    }
  }
  if (fallbackLang && languages[fallbackLang]) {
    languages["x-default"] = languages[fallbackLang];
  }

  const canonicalPath = seo?.canonicalUrl || defaultPath;
  // A manually-set `seo.canonicalUrl` may already be an absolute URL; prefixing
  // siteUrl would produce `https://site.comhttps://…`. Treat absolute values as
  // resolved and only prefix path-relative ones.
  const canonicalIsAbsolute = /^https?:\/\//i.test(canonicalPath);
  const canonicalUrl = canonicalIsAbsolute ? canonicalPath : siteUrl ? `${siteUrl}${canonicalPath}` : canonicalPath;
  const ogLocale = getOgLocale(lang);

  let other: Record<string, string> | undefined;
  if (seo?.metaOther) {
    try {
      const parsed = typeof seo.metaOther === "string" ? JSON.parse(seo.metaOther) : seo.metaOther;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        other = parsed as Record<string, string>;
      }
    } catch {
      // invalid JSON — skip
    }
  }

  const baseMetadata: ChaiPageMetadata = {
    title: seo?.title,
    description: seo?.description,
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    openGraph: {
      title: seo?.ogTitle || seo?.title,
      description: seo?.ogDescription || seo?.description,
      images: seo?.ogImage ? [seo?.ogImage] : [resolveFallbackOgImage(params.page, params.pageData, siteUrl)],
      type: "website",
      url: canonicalUrl || undefined,
      ...(ogLocale ? { locale: ogLocale } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
      ...(Object.keys(languages).length > 0 ? { languages } : {}),
    },
    robots: {
      index: !params.disallowIndexing && !seo?.noIndex,
      follow: !params.disallowIndexing && !seo?.noFollow,
      googleBot: {
        index: !params.disallowIndexing && !seo?.noIndex,
        follow: !params.disallowIndexing && !seo?.noFollow,
      },
    },
    ...(other ? { other } : {}),
  };

  if (transform) {
    return transform(baseMetadata, { ...params, seo });
  }

  return baseMetadata;
};
