import { describe, expect, it } from "vitest";
import { buildPageBindingData } from "./page-binding-data";

describe("buildPageBindingData", () => {
  it("builds page binding data for a static page", () => {
    expect(buildPageBindingData({ slug: "/about" })).toEqual({
      slug: "about",
      path: "/about",
      pathWithParams: "/about",
      querySeparator: "?",
      basePath: "/about",
    });
  });

  it("uses the last path segment as slug for dynamic pages", () => {
    expect(buildPageBindingData({ slug: "/inventory/toyota-rav4", pageBaseSlug: "/inventory" })).toEqual({
      slug: "toyota-rav4",
      path: "/inventory/toyota-rav4",
      pathWithParams: "/inventory/toyota-rav4",
      querySeparator: "?",
      basePath: "/inventory",
    });
  });

  // Empty `{}` is truthy; ensure we don't emit a trailing '?' for it.
  it("treats an empty searchParams object as no query string", () => {
    expect(buildPageBindingData({ slug: "/inventaire-neuf", searchParams: {} })).toMatchObject({
      pathWithParams: "/inventaire-neuf",
      querySeparator: "?",
    });
  });

  it("serializes searchParams into pathWithParams and uses & as separator", () => {
    expect(
      buildPageBindingData({
        slug: "/inventaire-neuf",
        searchParams: { _t: "1778251214707", max_mileage: "8000", max_price: "85000" },
      }),
    ).toMatchObject({
      pathWithParams: "/inventaire-neuf?_t=1778251214707&max_mileage=8000&max_price=85000",
      querySeparator: "&",
    });
  });
});
