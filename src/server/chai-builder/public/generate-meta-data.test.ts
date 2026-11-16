import { describe, expect, it } from "vitest";
import { withRequestContext } from "~/tests/setup/request-context";
import type { ChaiFullPage } from "~/types/pages";
import { generateMetaData as generateMetaDataInRequest } from "./generate-meta-data";

/** Runs in a real request whose site URL is https://example.com (what the route handler seeds). */
const generateMetaData = (args: Parameters<typeof generateMetaDataInRequest>[0]) =>
  withRequestContext(() => generateMetaDataInRequest(args), { siteUrl: "https://example.com" });

const docsPage = (seo: Record<string, unknown>): ChaiFullPage =>
  ({
    seo,
    slug: "/docs",
    dynamic: true,
    lang: "en",
    alternatePages: [],
  }) as unknown as ChaiFullPage;

const langVariantPage = (): ChaiFullPage =>
  ({
    seo: { title: "About" },
    slug: "/en/about",
    dynamic: false,
    lang: "en",
    primaryPage: "fr-id",
    fallbackLang: "fr",
    alternatePages: [{ id: "fr-id", lang: "fr", slug: "/about" }],
  }) as unknown as ChaiFullPage;

const vdpPage = (seo: Record<string, unknown>): ChaiFullPage =>
  ({
    seo,
    slug: "/inventaire-neuf",
    pageType: "vdp_page",
    dynamic: true,
    lang: "fr",
    alternatePages: [],
  }) as unknown as ChaiFullPage;

describe("generateMetaData", () => {
  it("a language variant canonicals/self-hreflangs to its OWN url, not the primary's", () => {
    const metadata = generateMetaData({
      page: langVariantPage(),
      pageData: {},
      settings: {},
      slug: "/en/about",
    });

    expect(metadata.alternates?.canonical).toBe("https://example.com/en/about");
    expect(metadata.openGraph?.url).toBe("https://example.com/en/about");
    expect(metadata.alternates?.languages?.en).toBe("https://example.com/en/about");
    expect(metadata.alternates?.languages?.fr).toBe("https://example.com/about");
  });

  it("decodes the entities the binding engine escaped in text metadata", () => {
    const metadata = generateMetaData({
      page: docsPage({
        title: "{{doc.title}} | ChaiBuilder",
        description: "{{doc.description}}",
      }),
      pageData: {
        doc: { title: "Caching & Revalidation", description: 'How "tags" work with <pre> blocks' },
      },
      settings: {},
      slug: "/docs/caching",
    });

    expect(metadata.title).toBe("Caching & Revalidation | ChaiBuilder");
    expect(metadata.description).toBe('How "tags" work with <pre> blocks');
    expect(metadata.openGraph?.title).toBe("Caching & Revalidation | ChaiBuilder");
    expect(metadata.openGraph?.description).toBe('How "tags" work with <pre> blocks');
  });

  it("leaves titles without bindings or entities untouched", () => {
    const metadata = generateMetaData({
      page: docsPage({ title: "Plain Title" }),
      pageData: {},
      settings: {},
      slug: "/docs/plain",
    });

    expect(metadata.title).toBe("Plain Title");
  });

  it("canonical/og:url use the resolved request slug on a dynamic page", () => {
    const metadata = generateMetaData({
      page: docsPage({ title: "Doc" }),
      pageData: {},
      settings: {},
      slug: "/docs/caching",
    });

    expect(metadata.alternates?.canonical).toBe("https://example.com/docs/caching");
    expect(metadata.openGraph?.url).toBe("https://example.com/docs/caching");
  });

  it("emits a fallback og:image, og:type website, and a self-referential hreflang", () => {
    const metadata = generateMetaData({
      page: docsPage({ title: "Doc" }),
      pageData: {},
      settings: {},
      slug: "/docs/caching",
    });

    expect(metadata.openGraph?.type).toBe("website");
    expect(metadata.openGraph?.images).toEqual(["https://example.com/logo.png"]);
    // self hreflang for the page's own language (en) — was missing before
    expect(metadata.alternates?.languages?.en).toBe("https://example.com/docs/caching");
  });

  it("falls back to the version image when the vehicle images array is empty", () => {
    const metadata = generateMetaData({
      page: vdpPage({ title: "Vehicle" }),
      pageData: { vehicle: { images: "[]" }, version: { image: "https://cdn.example.com/v.jpg" } },
      settings: {},
      slug: "/inventaire-neuf/car-1",
    });

    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/v.jpg"]);
  });

  it("reads a comma-separated vehicle images string", () => {
    const metadata = generateMetaData({
      page: vdpPage({ title: "Vehicle" }),
      pageData: { vehicle: { images: "https://cdn.example.com/a.jpg, https://cdn.example.com/b.jpg" } },
      settings: {},
      slug: "/inventaire-neuf/car-2",
    });

    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  it("does not double-prefix an absolute seo.canonicalUrl", () => {
    const metadata = generateMetaData({
      page: docsPage({ title: "Doc", canonicalUrl: "https://canonical.example.org/real" }),
      pageData: {},
      settings: {},
      slug: "/docs/caching",
    });

    expect(metadata.alternates?.canonical).toBe("https://canonical.example.org/real");
    expect(metadata.openGraph?.url).toBe("https://canonical.example.org/real");
  });

  it("forces noindex/nofollow when disallowIndexing is set", () => {
    const metadata = generateMetaData({
      page: docsPage({ title: "Doc" }),
      pageData: {},
      settings: {},
      slug: "/docs/caching",
      disallowIndexing: true,
    });

    expect(metadata.robots?.index).toBe(false);
    expect(metadata.robots?.follow).toBe(false);
    expect(metadata.robots?.googleBot?.index).toBe(false);
  });
});
