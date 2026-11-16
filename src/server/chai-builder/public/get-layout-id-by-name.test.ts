import { afterEach, describe, expect, it } from "vitest";
import { schema } from "~/server/chai-actions/db";
import { captureConsola } from "~/tests/utils/capture-consola";
import {
  getLayoutPagesTable,
  layoutIdByNameCacheKey,
  layoutIdByNameCacheTags,
  LAYOUTS_INDEX_TAG,
  pickOldestLayoutId,
} from "./get-layout-id-by-name";

describe("get-layout-id-by-name", () => {
  const log = captureConsola();
  afterEach(() => {
    log.records.length = 0;
  });

  it("builds cache key per app and name", () => {
    expect(layoutIdByNameCacheKey("app-1", "Main Layout")).toEqual(["layout-id-by-name-app-1-Main Layout"]);
  });

  it("uses layouts-index tag", () => {
    expect(layoutIdByNameCacheTags()).toEqual([LAYOUTS_INDEX_TAG]);
    expect(LAYOUTS_INDEX_TAG).toBe("layouts-index");
  });

  it("draft mode uses appPages; online uses appPagesOnline", () => {
    expect(getLayoutPagesTable(true)).toBe(schema.appPages);
    expect(getLayoutPagesTable(false)).toBe(schema.appPagesOnline);
  });

  it("pickOldestLayoutId returns null for empty rows", () => {
    expect(pickOldestLayoutId([], "Main")).toBeNull();
    expect(log.messages("warn")).toEqual([]);
  });

  it("pickOldestLayoutId returns single id without warn", () => {
    expect(pickOldestLayoutId([{ id: "layout-a" }], "Main")).toBe("layout-a");
    expect(log.messages("warn")).toEqual([]);
  });

  it("pickOldestLayoutId collision: oldest wins + warn", () => {
    expect(pickOldestLayoutId([{ id: "oldest" }, { id: "newer" }], "Main Layout")).toBe("oldest");
    const warnings = log.messages("warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Multiple layouts named");
    expect(warnings[0]).toContain("Main Layout");
    expect(warnings[0]).toContain("oldest");
  });
});
