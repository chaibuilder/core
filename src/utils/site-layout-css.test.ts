import { describe, expect, it } from "vitest";
import { getSiteContentWidthCss } from "~/utils/site-layout-css";

describe("getSiteContentWidthCss", () => {
  it("sets no max width for the fluid layout", () => {
    expect(getSiteContentWidthCss({ siteLayout: "fluid" })).toBe(":root { --site-content-width: none; }");
  });

  it("sets 1280px for the container layout", () => {
    expect(getSiteContentWidthCss({ siteLayout: "container" })).toBe(":root { --site-content-width: 1280px; }");
  });

  it("sets 768px for the narrow layout", () => {
    expect(getSiteContentWidthCss({ siteLayout: "narrow" })).toBe(":root { --site-content-width: 768px; }");
  });

  it("returns nothing when no site layout is set", () => {
    expect(getSiteContentWidthCss({})).toBe("");
    expect(getSiteContentWidthCss(undefined)).toBe("");
  });
});
