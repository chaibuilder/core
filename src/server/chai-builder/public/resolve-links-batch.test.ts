import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import type { ChaiBlock } from "~/types";
import { resolveLinksInPageBlocks } from "./resolve-links-batch";

const plainBlock = (id: string): ChaiBlock =>
  ({ _id: id, _type: "Heading", content: "Hello", styles: { nested: ["a", "b"] } }) as unknown as ChaiBlock;

const linkBlock = (id: string, href: string): ChaiBlock =>
  ({ _id: id, _type: "Link", link: { href, type: "page" } }) as unknown as ChaiBlock;

/** Runs in a published ("en") request over a published page `page-9` at `/fr/a-propos`. */
async function resolveInPublishedRequest(blocks: ChaiBlock[]) {
  return withTestDB(async ({ seed, inRequest }) => {
    await seed("appPagesOnline", { id: "page-9", slug: "/fr/a-propos" });
    const cache = installMemoryPersistentCache();
    const result = await inRequest(() => resolveLinksInPageBlocks({ id: "p1", blocks }), { draft: false, lang: "en" });
    return { result, cache };
  });
}

describe("resolveLinksInPageBlocks", () => {
  it("returns the original array untouched when no block has links", async () => {
    const blocks = [plainBlock("b1"), plainBlock("b2")];

    const { result, cache } = await resolveInPublishedRequest(blocks);

    expect(result).toBe(blocks);
    // No slug lookup was made.
    expect(cache.wraps).toEqual([]);
  });

  it("keeps identity for link-less blocks and rewrites only link-bearing ones", async () => {
    const noLink = plainBlock("b1");
    const withLink = linkBlock("b2", "pageType:page:page-9");
    const blocks = [noLink, withLink];

    const { result } = await resolveInPublishedRequest(blocks);

    expect(result).not.toBe(blocks);
    expect(result[0]).toBe(noLink);
    expect(result[1]).not.toBe(withLink);
    expect(result[1]).toEqual({
      _id: "b2",
      _type: "Link",
      link: { href: "/fr/a-propos", type: "page", pageId: "page-9" },
    });
    // Input block must not be mutated.
    expect(withLink).toEqual({ _id: "b2", _type: "Link", link: { href: "pageType:page:page-9", type: "page" } });
  });

  it("still backfills pageId on malformed refs alongside a resolvable one", async () => {
    // "pageType::x" never reaches the resolver (empty pageType key) but the transform's
    // pageId backfill fires on href shape alone — the block must not be skipped by identity.
    const malformed = { _id: "b1", _type: "Link", link: { href: "pageType::page-9", type: "page" } };
    const blocks = [malformed as unknown as ChaiBlock, linkBlock("b2", "pageType:page:page-9")];

    const { result } = await resolveInPublishedRequest(blocks);

    expect(result[0]).not.toBe(malformed);
    expect(result[0]).toEqual({
      _id: "b1",
      _type: "Link",
      link: { href: "pageType::page-9", type: "page", pageId: "page-9" },
    });
    expect(result[1]).toEqual({
      _id: "b2",
      _type: "Link",
      link: { href: "/fr/a-propos", type: "page", pageId: "page-9" },
    });
  });

  // #4571: an anchor inside rich text is not a Link block; its ref must resolve too.
  it("resolves refs embedded in HTML content, unknown pages to '#'", async () => {
    const richText = {
      _id: "b1",
      _type: "RichText",
      content:
        '<p>See <a href="pageType:page:page-9">about</a>, <a class="x" href=\'pageType:page:page-9\'>again</a> and <a href="pageType:page:missing">gone</a>. pageType:page:page-9 as text stays.</p>',
    };
    const blocks = [plainBlock("b0"), richText as unknown as ChaiBlock];

    const { result } = await resolveInPublishedRequest(blocks);

    expect(result[0]).toBe(blocks[0]);
    expect(result[1]).toEqual({
      ...richText,
      content:
        '<p>See <a href="/fr/a-propos">about</a>, <a class="x" href=\'/fr/a-propos\'>again</a> and <a href="#">gone</a>. pageType:page:page-9 as text stays.</p>',
    });
  });

  it("leaves HTML without an embedded ref href untouched", async () => {
    const text = { _id: "b1", _type: "Paragraph", content: "<p>pageType:page:page-9 is just text</p>" };
    const blocks = [text as unknown as ChaiBlock];

    const { result } = await resolveInPublishedRequest(blocks);

    expect(result).toBe(blocks);
  });

  it("resolves embedded refs in every i18n prop, whitespace around '=' included", async () => {
    const richText = {
      _id: "b1",
      _type: "Paragraph",
      content: `<p><a href='pageType:page:page-9'>about</a></p>`,
      "content-en": `<p><a\n  href = "pageType:page:page-9">about</a></p>`,
    } as unknown as ChaiBlock;

    const { result } = await resolveInPublishedRequest([richText]);

    expect(result[0]).toEqual({
      _id: "b1",
      _type: "Paragraph",
      content: `<p><a href='/fr/a-propos'>about</a></p>`,
      "content-en": `<p><a\n  href = "/fr/a-propos">about</a></p>`,
    });
  });

  it("escapes the resolved URL spliced into the attribute", async () => {
    const result = await withTestDB(async ({ seed, inRequest }) => {
      await seed("appPagesOnline", { id: "page-9", slug: `/l'offre?a=1&b="2"` });
      installMemoryPersistentCache();
      const blocks = [
        { _id: "b1", _type: "Paragraph", content: `<a href='pageType:page:page-9'>x</a>` } as unknown as ChaiBlock,
      ];
      return inRequest(() => resolveLinksInPageBlocks({ id: "p1", blocks }), { draft: false, lang: "en" });
    });

    expect(result[0]).toMatchObject({ content: `<a href='/l&#39;offre?a=1&amp;b=&quot;2&quot;'>x</a>` });
  });

  it("leaves a ref in another attribute (data-href) untouched, with no slug lookup", async () => {
    const prose = {
      _id: "b1",
      _type: "Paragraph",
      content: "<p><a data-href='pageType:page:page-9'>x</a></p>",
    } as unknown as ChaiBlock;
    const blocks = [prose];

    const { result, cache } = await resolveInPublishedRequest(blocks);

    expect(result).toBe(blocks);
    expect(cache.wraps).toEqual([]);
  });

  it("resolves unresolvable refs to '#'", async () => {
    const blocks = [linkBlock("b1", "pageType:page:missing"), linkBlock("b2", "pageType:no-such-type:page-9")];

    const { result } = await resolveInPublishedRequest(blocks);

    expect(result).toEqual([
      { _id: "b1", _type: "Link", link: { href: "#", type: "page", pageId: "missing" } },
      { _id: "b2", _type: "Link", link: { href: "#", type: "page", pageId: "page-9" } },
    ]);
  });

  // A slug lookup that fails must fail the render, not ship every link as "#".
  it("rejects on a failed slug lookup and resolves the links once the table is back", async () => {
    await withTestDB(({ seedMany }) =>
      seedMany("appPagesOnline", [
        { id: "page-9", slug: "/fr/a-propos" },
        { id: "page-10", slug: "/contact" },
      ]),
    );
    installMemoryPersistentCache();
    const blocks = [linkBlock("b1", "pageType:page:page-9"), linkBlock("b2", "pageType:page:page-10")];
    const resolve = () =>
      withRequestContext(() => resolveLinksInPageBlocks({ id: "p1", blocks }), { draft: false, lang: "en" });

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(resolve()).rejects.toThrow("FAILED_TO_RESOLVE_PAGE_SLUGS");
    });

    await expect(resolve()).resolves.toEqual([
      { _id: "b1", _type: "Link", link: { href: "/fr/a-propos", type: "page", pageId: "page-9" } },
      { _id: "b2", _type: "Link", link: { href: "/contact", type: "page", pageId: "page-10" } },
    ]);
  });
});
