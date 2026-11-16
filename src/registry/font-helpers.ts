import { compact, filter, has, map, sortBy, uniq, uniqBy } from "lodash-es";
import { getRegisteredFont, resolveFont } from "~/registry/fonts";
import { ChaiFont, ChaiFontBySrc, ChaiFontByUrl } from "~/types";

const getThemeFontFaceCSS = (fonts: string[]) => {
  const resolved = compact(map(fonts, resolveFont));
  const imports = uniq(
    (filter(resolved, (font: ChaiFont) => has(font, "url")) as ChaiFontByUrl[]).map((font) => `@import url("${font.url}");`),
  ).join("\n");
  const faces = getThemeCustomFontFaceStyle(filter(resolved, (font: ChaiFont) => has(font, "src")) as ChaiFontBySrc[]);
  // @import must precede every other rule.
  return [imports, faces].filter(Boolean).join("\n");
};

const getThemeCustomFontFaceStyle = (fonts: ChaiFontBySrc[]) => {
  if (!fonts || fonts.length === 0) return "";

  return uniqBy(fonts, "family")
    .map((font: ChaiFontBySrc) =>
      font.src
        .map(
          (source) => `@font-face {
        font-family: "${font.family}";
        src: url("${source.url}") format("${source.format}");
        font-display: swap;
        font-optical-sizing: auto;
        ${source.fontWeight ? `font-weight: ${source.fontWeight};` : ""}
        ${source.fontStyle ? `font-style: ${source.fontStyle};` : ""}
        ${source.fontStretch ? `font-stretch: ${source.fontStretch};` : ""}
      }`,
        )
        .join("\n"),
    )
    .join("\n");
};

// Preload up to two weights per family (four when heading and body share one),
// four in total. One preloaded face is not enough: nav, buttons and headings use
// other weights, and every face that is not preloaded sits at the end of the
// critical request chain (0.8–1.5 s measured on the Laplante home pages, where
// only weight 400 was preloaded).
const MAX_FONT_PRELOADS = 4;

// Weights in the order they usually matter above the fold: body text, then the
// heading/button weights. Unknown weights sort last.
const PRELOAD_WEIGHT_ORDER = [400, 700, 600, 500, 800, 300, 900, 200, 100];

// A variable font is one file for a weight range ("100 900"): rank it by the
// best weight it covers.
const weightRank = (fontWeight = "normal") => {
  const [min, max = min] = fontWeight
    .trim()
    .split(/\s+/)
    .map((weight) => (weight === "normal" ? 400 : weight === "bold" ? 700 : Number(weight)));
  const rank = PRELOAD_WEIGHT_ORDER.findIndex((weight) => weight >= min && weight <= max);
  return rank === -1 ? PRELOAD_WEIGHT_ORDER.length : rank;
};

export const getFontStyles = async (
  headingFont: string,
  bodyFont: string,
): Promise<{ fontStyles: string; preloads: string[] }> => {
  const fontStyles = getThemeFontFaceCSS([headingFont, bodyFont]);

  const fonts = [headingFont, ...(headingFont !== bodyFont ? [bodyFont] : [])];
  // Upright faces only: italics rarely render above the fold.
  const families = fonts
    .map((fontName) =>
      ((getRegisteredFont(fontName) as ChaiFontBySrc | undefined)?.src ?? []).filter(
        (source) => (source.fontStyle ?? "normal") === "normal",
      ),
    )
    .filter((sources) => sources.length > 0);
  const perFamily = families.length > 1 ? 2 : MAX_FONT_PRELOADS;
  const preloads = families.flatMap((sources) =>
    sortBy(sources, (source) => weightRank(source.fontWeight))
      .slice(0, perFamily)
      .map((source) => source.url),
  );

  return { fontStyles, preloads: uniq(preloads).slice(0, MAX_FONT_PRELOADS) };
};
