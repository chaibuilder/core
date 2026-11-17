import { describe, expect, it } from "vitest";
import { getIframeInitialContent, TAILWIND_CDN_URL, TAILWIND_THEME_STYLE_ID } from "./IframeInitialContent";

describe("getIframeInitialContent", () => {
  it("loads the Tailwind v4 browser build", () => {
    const html = getIframeInitialContent();

    expect(TAILWIND_CDN_URL).toContain("@tailwindcss/browser@4");
    expect(html).toContain(`src="${TAILWIND_CDN_URL}"`);
    expect(html).not.toContain("cdn.tailwindcss.com");
    expect(html).not.toContain("__TAILWIND_CDN__");
    expect(html).not.toContain("__HTML_DIR__");
  });

  it("sets html dir for rtl layouts", () => {
    const html = getIframeInitialContent({ htmlDir: "rtl" });

    expect(html).toContain('dir="rtl"');
    expect(html).toContain(TAILWIND_CDN_URL);
  });

  // The v4 browser build drops the whole sheet when one utility is unknown.
  it("compiles standalone without theme-dependent utilities in base", () => {
    const html = getIframeInitialContent();

    expect(html).toContain("@custom-variant dark (&:where(.dark, .dark *));");
    expect(html).toContain("border-color: var(--color-border, currentColor);");
    expect(html).not.toContain("@apply border-border;");
    expect(html).not.toContain("__TAILWIND_STYLE__");
  });

  // Spelling out the import makes the browser resolve "tailwindcss" as a relative URL and 404;
  // the build injects it for us when the concatenated CSS has no @import of its own.
  it("leaves the tailwindcss import to the browser build", () => {
    expect(getIframeInitialContent()).not.toContain("@import");
  });

  it("ships an empty theme placeholder for TailwindV4Theme to fill", () => {
    const html = getIframeInitialContent();

    expect(html).toContain(`<style type="text/tailwindcss" id="${TAILWIND_THEME_STYLE_ID}"></style>`);
  });

  it("ships the rte utilities", () => {
    const html = getIframeInitialContent();

    expect(html).toContain('<style type="text/tailwindcss">');
    expect(html).toContain("@apply list-disc pl-6 text-base;");
  });
});
