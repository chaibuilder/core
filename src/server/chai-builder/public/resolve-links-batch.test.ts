import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChaiBlock } from "~/types";

const mocks = vi.hoisted(() => ({
  getResolvedPageType: vi.fn(),
  resolvePageSlugs: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <T,>(fn: T) => fn,
}));

vi.mock("~/server/chai-builder/state", () => ({
  getInitializedState: () => ({ appId: "app-1", draftMode: false, lang: "en", fallbackLang: "en" }),
  getOptionalRequestState: () => undefined,
}));

vi.mock("~/server/chai-builder/public/cache-utils", () => ({
  withRequestCache: (fn: any) => fn,
}));

vi.mock("~/server/defaults", () => ({
  getResolvedPageType: mocks.getResolvedPageType,
}));

vi.mock("~/server/chai-builder/public/get-page-slug-by-id", () => ({
  resolvePageSlugs: mocks.resolvePageSlugs,
}));

import { resolveLinksInPageBlocks } from "./resolve-links-batch";

const plainBlock = (id: string): ChaiBlock =>
  ({ _id: id, _type: "Heading", content: "Hello", styles: { nested: ["a", "b"] } }) as unknown as ChaiBlock;

const linkBlock = (id: string, href: string): ChaiBlock =>
  ({ _id: id, _type: "Link", link: { href, type: "page" } }) as unknown as ChaiBlock;

beforeEach(() => {
  mocks.getResolvedPageType.mockReset().mockReturnValue({});
  mocks.resolvePageSlugs.mockReset().mockResolvedValue(new Map([["page-9", "/fr/a-propos"]]));
});

describe("resolveLinksInPageBlocks", () => {
  it("returns the original array untouched when no block has links", async () => {
    const blocks = [plainBlock("b1"), plainBlock("b2")];

    const result = await resolveLinksInPageBlocks({ id: "p1", blocks });

    expect(result).toBe(blocks);
    expect(mocks.resolvePageSlugs).not.toHaveBeenCalled();
  });

  it("keeps identity for link-less blocks and rewrites only link-bearing ones", async () => {
    const noLink = plainBlock("b1");
    const withLink = linkBlock("b2", "pageType:pages:page-9");
    const blocks = [noLink, withLink];

    const result = await resolveLinksInPageBlocks({ id: "p1", blocks });

    expect(result).not.toBe(blocks);
    expect(result[0]).toBe(noLink);
    expect(result[1]).not.toBe(withLink);
    expect(result[1]).toEqual({
      _id: "b2",
      _type: "Link",
      link: { href: "/fr/a-propos", type: "page", pageId: "page-9" },
    });
    // Input block must not be mutated.
    expect(withLink).toEqual({ _id: "b2", _type: "Link", link: { href: "pageType:pages:page-9", type: "page" } });
  });

  it("still backfills pageId on malformed refs alongside a resolvable one", async () => {
    // "pageType::x" never reaches the resolver (empty pageType key) but the transform's
    // pageId backfill fires on href shape alone — the block must not be skipped by identity.
    const malformed = { _id: "b1", _type: "Link", link: { href: "pageType::page-9", type: "page" } };
    const blocks = [malformed as unknown as ChaiBlock, linkBlock("b2", "pageType:pages:page-9")];

    const result = await resolveLinksInPageBlocks({ id: "p1", blocks });

    expect(result[0]).not.toBe(malformed);
    expect(result[0]).toEqual({
      _id: "b1",
      _type: "Link",
      link: { href: "pageType::page-9", type: "page", pageId: "page-9" },
    });
  });

  it("resolves unresolvable refs to '#'", async () => {
    mocks.resolvePageSlugs.mockResolvedValue(new Map());
    const blocks = [linkBlock("b1", "pageType:pages:missing")];

    const result = await resolveLinksInPageBlocks({ id: "p1", blocks });

    expect(result[0]).toEqual({
      _id: "b1",
      _type: "Link",
      link: { href: "#", type: "page", pageId: "missing" },
    });
  });
});
