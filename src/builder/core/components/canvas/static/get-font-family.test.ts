import { describe, expect, it } from "vitest";
import { getFontFamily } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { registerChaiFont } from "~/registry/fonts";

describe("getFontFamily", () => {
  it("appends the fallback of a registered font", () => {
    expect(getFontFamily("Arial")).toBe(`"Arial", Helvetica, sans-serif`);
  });

  // A trailing comma invalidates the whole font-family declaration, so the element silently
  // inherits instead — the font loads but never applies.
  it("emits valid CSS for a font registered without a fallback", () => {
    registerChaiFont("Poppins", { src: [{ url: "https://example.com/poppins.woff2", format: "woff2" }] } as never);

    expect(getFontFamily("Poppins")).toBe(`"Poppins"`);
    expect(getFontFamily("Poppins")).not.toContain(", ");
  });

  it("emits valid CSS for an unregistered font", () => {
    expect(getFontFamily("Unregistered Font")).toBe(`"Unregistered Font", ui-sans-serif, system-ui, sans-serif`);
  });
});
