// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeoSearchPreview } from "./seo-search-preview";

const externalData = { product: { price: 1234.5 } };

describe("SeoSearchPreview", () => {
  it("resolves bindings in the locale the panel is editing", () => {
    render(<SeoSearchPreview title="{{product.price | number 2}}" externalData={externalData} locale="de-DE" />);
    expect(screen.getByTitle("1.234,50")).toBeTruthy();
  });

  it("defaults to en when the panel has no locale", () => {
    render(<SeoSearchPreview title="{{product.price | number 2}}" externalData={externalData} />);
    expect(screen.getByTitle("1,234.50")).toBeTruthy();
  });

  it("strips tokens that resolve to nothing instead of showing them raw", () => {
    render(<SeoSearchPreview title="Buy {{product.missing}}" externalData={externalData} locale="en-US" />);
    expect(screen.getByTitle("Buy")).toBeTruthy();
  });
});
