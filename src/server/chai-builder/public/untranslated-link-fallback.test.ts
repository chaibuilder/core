import { afterEach, describe, expect, it } from "vitest";
import { untranslatedLinkFallback, untranslatedSlug } from "./untranslated-link-fallback";

describe("untranslatedLinkFallback", () => {
  const original = process.env.CHAI_UNTRANSLATED_LINK_FALLBACK;
  afterEach(() => {
    if (original === undefined) delete process.env.CHAI_UNTRANSLATED_LINK_FALLBACK;
    else process.env.CHAI_UNTRANSLATED_LINK_FALLBACK = original;
  });

  it("defaults to the primary slug, including for unknown values", () => {
    delete process.env.CHAI_UNTRANSLATED_LINK_FALLBACK;
    expect(untranslatedLinkFallback()).toBe("primary");
    process.env.CHAI_UNTRANSLATED_LINK_FALLBACK = "whatever";
    expect(untranslatedLinkFallback()).toBe("primary");
  });

  it("accepts home and none", () => {
    process.env.CHAI_UNTRANSLATED_LINK_FALLBACK = "home";
    expect(untranslatedLinkFallback()).toBe("home");
    process.env.CHAI_UNTRANSLATED_LINK_FALLBACK = "none";
    expect(untranslatedLinkFallback()).toBe("none");
  });
});

describe("untranslatedSlug", () => {
  it("primary: the default-language slug, or unresolved when it is missing too", () => {
    expect(untranslatedSlug("primary", "en", "/a-propos")).toBe("/a-propos");
    expect(untranslatedSlug("primary", "en", undefined)).toBeNull();
  });

  it("home: the language home regardless of the primary slug", () => {
    expect(untranslatedSlug("home", "en", "/a-propos")).toBe("/en");
    expect(untranslatedSlug("home", "en", undefined)).toBe("/en");
  });

  it("none: always unresolved", () => {
    expect(untranslatedSlug("none", "en", "/a-propos")).toBeNull();
  });
});
