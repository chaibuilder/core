import { describe, expect, it } from "vitest";
import { collectRevalidationPaths, collectRevalidationTags } from "./action-cache-effects";

describe("collectRevalidationTags", () => {
  it("reads tags off a single action result", () => {
    expect(collectRevalidationTags({ tags: ["page-1", "slug:/about"] })).toEqual(["page-1", "slug:/about"]);
  });

  it("flattens tags across an array of results", () => {
    expect(collectRevalidationTags([{ tags: ["a"] }, { tags: ["b"] }, { noTags: true }, null])).toEqual(["a", "b"]);
  });

  it("returns nothing for results that report no tags", () => {
    expect(collectRevalidationTags(undefined)).toEqual([]);
    expect(collectRevalidationTags(null)).toEqual([]);
    expect(collectRevalidationTags({ success: true })).toEqual([]);
    expect(collectRevalidationTags({ tags: undefined })).toEqual([]);
  });
});

describe("collectRevalidationPaths", () => {
  it("reads paths off an action result", () => {
    expect(collectRevalidationPaths({ paths: ["/about"] })).toEqual(["/about"]);
  });

  it("returns nothing for results that report no paths", () => {
    expect(collectRevalidationPaths(undefined)).toEqual([]);
    expect(collectRevalidationPaths({ tags: ["a"] })).toEqual([]);
    expect(collectRevalidationPaths({ paths: undefined })).toEqual([]);
  });
});
