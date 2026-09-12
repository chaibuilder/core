import { describe, expect, it, test } from "vitest";
import { buildDynamicItemPath } from "./build-dynamic-item-path";
import { pickDynamicBaseSlugsForLang } from "./get-base-slugs";

test("buildDynamicItemPath normalizes paths", () => {
  expect(buildDynamicItemPath({ slug: "/blog", dynamicSlugCustom: null }, "my-post")).toBe("/blog/my-post");
  expect(buildDynamicItemPath({ slug: "/blog/", dynamicSlugCustom: null }, "/my-post")).toBe("/blog/my-post");
  expect(buildDynamicItemPath({ slug: "/blog", dynamicSlugCustom: "/preview" }, "my-post")).toBe(
    "/blog/my-post/preview",
  );
});

describe("pickDynamicBaseSlugsForLang", () => {
  const row = (overrides = {}) => ({
    id: "fr-blog",
    slug: "/blogue",
    lang: "",
    primaryPage: null as string | null,
    dynamic: true as boolean | null,
    dynamicSlugCustom: "(/[a-z0-9-]+)?" as string | null,
    ...overrides,
  });

  it("returns alt rows hydrated from their dynamic primary", () => {
    const primary = row();
    const alt = row({
      id: "en-blog",
      slug: "/en/blog",
      lang: "en",
      primaryPage: "fr-blog",
      dynamic: false,
      dynamicSlugCustom: null,
    });

    const result = pickDynamicBaseSlugsForLang([primary, alt], "en");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("en-blog");
    expect(result[0].dynamic).toBe(true);
    expect(result[0].dynamicSlugCustom).toBe("(/[a-z0-9-]+)?");
  });

  it("keeps the alt row's own dynamicSlugCustom when present", () => {
    const alt = row({
      id: "en-blog",
      slug: "/en/blog",
      lang: "en",
      primaryPage: "fr-blog",
      dynamic: false,
      dynamicSlugCustom: "(/[a-z]+)?",
    });

    const result = pickDynamicBaseSlugsForLang([row(), alt], "en");
    expect(result[0].dynamicSlugCustom).toBe("(/[a-z]+)?");
  });

  it("excludes primaries and alt rows whose primary is not dynamic", () => {
    const staticPrimary = row({ id: "fr-about", slug: "/a-propos", dynamic: false, dynamicSlugCustom: null });
    const altOfStatic = row({
      id: "en-about",
      slug: "/en/about",
      lang: "en",
      primaryPage: "fr-about",
      dynamic: false,
      dynamicSlugCustom: null,
    });

    expect(pickDynamicBaseSlugsForLang([row(), staticPrimary, altOfStatic], "en")).toHaveLength(0);
  });

  it("keeps alt rows that copied their own dynamic flag correctly", () => {
    const selfDynamicAlt = row({
      id: "en-blog",
      slug: "/en/blog",
      lang: "en",
      primaryPage: "fr-blog",
      dynamic: true,
      dynamicSlugCustom: "(/[a-z]+)?",
    });

    const result = pickDynamicBaseSlugsForLang([selfDynamicAlt], "en");
    expect(result).toHaveLength(1);
    expect(result[0].dynamicSlugCustom).toBe("(/[a-z]+)?");
  });
});
