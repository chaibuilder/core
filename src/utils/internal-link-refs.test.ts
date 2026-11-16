import { describe, expect, test } from "vitest";
import type { ChaiBlock } from "~/types/common";
import {
  buildInternalLinkResolver,
  getLinkablePages,
  isLinkablePage,
  rewriteInternalLinks,
  rewriteInternalLinksInProps,
  toPageLinkRef,
  type LinkablePage,
} from "./internal-link-refs";

const ABOUT_ID = "11111111-1111-4111-8111-111111111111";
const HOME_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const ABOUT_FR_ID = "44444444-4444-4444-8444-444444444444";

const pages: LinkablePage[] = [
  { id: HOME_ID, slug: "/", pageType: "page" },
  { id: ABOUT_ID, slug: "/about", pageType: "page" },
  { id: POST_ID, slug: "/blog/hello", pageType: "blog-post" },
  { id: ABOUT_FR_ID, slug: "/fr/a-propos", pageType: "page", primaryPage: ABOUT_ID },
  { id: "partial-1", slug: "", pageType: "global" },
  { id: "dynamic-1", slug: "/products", pageType: "product", dynamic: true },
  { id: "dynamic-1-fr", slug: "/fr/produits", pageType: "product", primaryPage: "dynamic-1" },
  { id: "folder-1", slug: "/docs", pageType: "_folder" },
];

describe("toPageLinkRef", () => {
  test("anchors to the primary page and defaults the page type", () => {
    expect(toPageLinkRef({ id: ABOUT_ID, pageType: "blog-post" })).toBe(`pageType:blog-post:${ABOUT_ID}`);
    expect(toPageLinkRef({ id: ABOUT_FR_ID, primaryPage: ABOUT_ID })).toBe(`pageType:page:${ABOUT_ID}`);
  });

  test("partials and dynamic pages are not linkable", () => {
    expect(isLinkablePage({ id: "a", slug: "/a" })).toBe(true);
    expect(isLinkablePage({ id: "a", slug: "" })).toBe(false);
    expect(isLinkablePage({ id: "a", slug: "/a", dynamic: true })).toBe(false);
  });

  // A folder only lends its segment to its children; its own slug is a 404.
  test("folders are not linkable", () => {
    expect(isLinkablePage({ id: "a", slug: "/docs", pageType: "_folder" })).toBe(false);
  });

  test("a variant follows its primary page", () => {
    expect(getLinkablePages(pages).map((page) => page.id)).toEqual([HOME_ID, ABOUT_ID, POST_ID, ABOUT_FR_ID]);
  });
});

describe("buildInternalLinkResolver", () => {
  const resolve = buildInternalLinkResolver(pages, { siteUrl: "https://example.com/" }).toRef;

  test("maps a known slug to its reference", () => {
    expect(resolve("/about")).toBe(`pageType:page:${ABOUT_ID}`);
    expect(resolve("/blog/hello")).toBe(`pageType:blog-post:${POST_ID}`);
    expect(resolve("/")).toBe(`pageType:page:${HOME_ID}`);
  });

  test("ignores a trailing slash and surrounding whitespace", () => {
    expect(resolve(" /about/ ")).toBe(`pageType:page:${ABOUT_ID}`);
  });

  test("resolves an absolute URL on the site's own origin", () => {
    expect(resolve("https://example.com/about")).toBe(`pageType:page:${ABOUT_ID}`);
    expect(resolve("https://example.com")).toBe(`pageType:page:${HOME_ID}`);
  });

  test("recognises the site origin however it is written", () => {
    expect(resolve("https://example.com:443/about")).toBe(`pageType:page:${ABOUT_ID}`);
    expect(resolve("HTTPS://Example.COM/about/")).toBe(`pageType:page:${ABOUT_ID}`);
    expect(resolve("https://example.com/about?ref=nav")).toBeNull();
    expect(resolve("http://example.com/about")).toBeNull();
  });

  test("a language variant's slug resolves to its primary page", () => {
    expect(resolve("/fr/a-propos")).toBe(`pageType:page:${ABOUT_ID}`);
  });

  test.each([
    ["unknown path", "/inventory"],
    ["partial", ""],
    ["dynamic page", "/products"],
    ["variant of a dynamic page", "/fr/produits"],
    ["folder", "/docs"],
    ["external URL", "https://other.com/about"],
    ["protocol-relative URL", "//other.com/about"],
    ["mailto", "mailto:hi@example.com"],
    ["tel", "tel:+123"],
    ["anchor", "#team"],
    ["fragment on a page", "/about#team"],
    ["query on a page", "/about?ref=nav"],
    ["binding", "{{page.url}}"],
    ["relative path", "about"],
    ["existing reference", `pageType:page:${ABOUT_ID}`],
  ])("leaves %s untouched", (_label, href) => {
    expect(resolve(href)).toBeNull();
  });

  test("without a siteUrl, absolute URLs are never rewritten", () => {
    expect(buildInternalLinkResolver(pages).toRef("https://example.com/about")).toBeNull();
  });

  test("tolerates a missing page list", () => {
    expect(buildInternalLinkResolver(undefined).toRef("/about")).toBeNull();
  });

  test("toPath maps a reference back to the primary page's path", () => {
    const { toPath } = buildInternalLinkResolver(pages);
    expect(toPath(`pageType:page:${ABOUT_ID}`)).toBe("/about");
    expect(toPath("pageType:page:unknown")).toBeNull();
  });
});

describe("rewriteInternalLinks", () => {
  const resolve = buildInternalLinkResolver(pages);

  test("rewrites link-shaped props on any block type", () => {
    const blocks: ChaiBlock[] = [
      { _id: "a", _type: "Link", link: { href: "/about", target: "_blank" } },
      { _id: "b", _type: "Button", link: { href: "/blog/hello" } },
      { _id: "c", _type: "PromoCard", cta: { href: "/", type: "url" } },
    ];
    const [link, button, card] = rewriteInternalLinks(blocks, resolve);
    expect(link.link).toEqual({ href: `pageType:page:${ABOUT_ID}`, target: "_blank", type: "pageType" });
    expect(button.link).toEqual({ href: `pageType:blog-post:${POST_ID}`, type: "pageType" });
    expect(card.cta).toEqual({ href: `pageType:page:${HOME_ID}`, type: "pageType" });
  });

  test("backfills the link type the import dropped", () => {
    const [external, ref] = rewriteInternalLinks(
      [
        { _id: "a", _type: "Link", link: { href: "https://other.com" } },
        { _id: "b", _type: "Link", link: { href: `pageType:page:${ABOUT_ID}` } },
      ],
      resolve,
    );
    expect(external.link).toEqual({ href: "https://other.com", type: "url" });
    expect(ref.link).toEqual({ href: `pageType:page:${ABOUT_ID}`, type: "pageType" });
  });

  test("keeps an explicit non-page link type", () => {
    const block: ChaiBlock = { _id: "a", _type: "Link", link: { href: "mailto:hi@example.com", type: "email" } };
    expect(rewriteInternalLinks([block], resolve)[0]).toBe(block);
  });

  test("blocks without a changed link keep their identity", () => {
    const plain: ChaiBlock = { _id: "a", _type: "Heading", content: "/about" };
    const settled: ChaiBlock = {
      _id: "b",
      _type: "Link",
      link: { href: `pageType:page:${ABOUT_ID}`, type: "pageType" },
    };
    const result = rewriteInternalLinks([plain, settled], resolve);
    expect(result[0]).toBe(plain);
    expect(result[1]).toBe(settled);
  });

  // An anchor inside text stays in the block's HTML content, which render-time
  // link resolution never reads — a reference there would ship as a dead href.
  test("a reference embedded in text content is turned back into a path", () => {
    const ref = `pageType:page:${ABOUT_ID}`;
    const [paragraph, unknown, internal] = rewriteInternalLinks(
      [
        { _id: "a", _type: "Paragraph", content: `<p>See <a href='${ref}'>about</a> and <a href="${ref}">us</a></p>` },
        { _id: "b", _type: "Paragraph", content: "<p><a href='pageType:page:gone'>gone</a></p>" },
        { _id: "c", _type: "Paragraph", _name: `<a href='${ref}'>` },
      ],
      resolve,
    );
    expect(paragraph.content).toBe(`<p>See <a href='/about'>about</a> and <a href="/about">us</a></p>`);
    expect(unknown.content).toBe("<p><a href='pageType:page:gone'>gone</a></p>");
    expect(internal._name).toBe(`<a href='${ref}'>`);
  });

  test("a path embedded in text content is left alone", () => {
    const block: ChaiBlock = { _id: "a", _type: "Paragraph", content: "<p>See <a href='/about'>about</a></p>" };
    expect(rewriteInternalLinks([block], resolve)[0]).toBe(block);
  });

  test("rewriteInternalLinksInProps handles raw custom-block props", () => {
    const props = { title: "Hi", cta: { href: "/about" }, tags: ["/about"] };
    expect(rewriteInternalLinksInProps(props, resolve)).toEqual({
      title: "Hi",
      cta: { href: `pageType:page:${ABOUT_ID}`, type: "pageType" },
      tags: ["/about"],
    });
  });
});
