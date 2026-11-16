import { describe, expect, it } from "vitest";
import { collectTokenUsageOnPage, getTokenIdsUsedOnPage } from "./design-token-usage";

describe("collectTokenUsageOnPage", () => {
  const blocks = [
    { _id: "a", _type: "Box", styles: "#styles:,dt#btn-primary p-2" },
    { _id: "b", _type: "Box", styles: "#styles:flex,dt#btn p-2" },
  ] as any[];

  it("does not match a token that is only a prefix of another", () => {
    expect(collectTokenUsageOnPage(blocks.slice(0, 1), "dt#btn")).toEqual([]);
  });

  it("matches the exact token", () => {
    expect(collectTokenUsageOnPage(blocks, "dt#btn").map((b) => b.id)).toEqual(["b"]);
    expect(collectTokenUsageOnPage(blocks, "dt#btn-primary").map((b) => b.id)).toEqual(["a"]);
  });
});

describe("getTokenIdsUsedOnPage", () => {
  it("returns exact-match membership only", () => {
    const blocks = [{ _id: "a", _type: "Box", styles: "#styles:,dt#btn-primary p-2" }] as any[];
    const used = getTokenIdsUsedOnPage(blocks, ["dt#btn", "dt#btn-primary"]);
    expect([...used]).toEqual(["dt#btn-primary"]);
  });
});
