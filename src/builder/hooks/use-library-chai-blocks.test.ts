import { describe, expect, it } from "vitest";
import { getLibraryChaiBlocks } from "./use-library-chai-blocks";

const block = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  label: type,
  group: "custom",
  category: "core",
  ...extra,
});

describe("getLibraryChaiBlocks", () => {
  it("returns only blocks registered with showInLibrary", () => {
    const blocks = {
      Hero: block("Hero", { showInLibrary: true, preview: "https://example.com/hero.png" }),
      Card: block("Card"),
      Banner: block("Banner", { showInLibrary: false }),
    };
    expect(getLibraryChaiBlocks(blocks, "page").map((b) => b.type)).toEqual(["Hero"]);
  });

  it("skips hidden and non-core blocks", () => {
    const blocks = {
      Hidden: block("Hidden", { showInLibrary: true, hidden: true }),
      Partial: block("Partial", { showInLibrary: true, category: "partial" }),
    };
    expect(getLibraryChaiBlocks(blocks, "page")).toEqual([]);
  });

  it("respects pageTypes", () => {
    const blocks = { Listing: block("Listing", { showInLibrary: true, pageTypes: ["vdp"] }) };
    expect(getLibraryChaiBlocks(blocks, "page")).toEqual([]);
    expect(getLibraryChaiBlocks(blocks, "vdp").map((b) => b.type)).toEqual(["Listing"]);
  });

  it("applies canShowBlock with pageType context", () => {
    const blocks = {
      AgentOnly: block("AgentOnly", { showInLibrary: true, metadata: { siteTypes: ["Agent"] } }),
      Everyone: block("Everyone", { showInLibrary: true }),
    };
    const seenPageTypes: Array<string | undefined> = [];
    const filter = (b: { metadata?: Record<string, unknown> }, ctx: { pageType?: string }) => {
      seenPageTypes.push(ctx.pageType);
      const types = b.metadata?.siteTypes as string[] | undefined;
      return !types || types.includes("Company");
    };

    expect(getLibraryChaiBlocks(blocks, "landing", filter).map((b) => b.type)).toEqual(["Everyone"]);
    expect(seenPageTypes).toEqual(["landing", "landing"]);
  });
});
