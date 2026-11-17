import { flatten, get, keys, uniq, uniqBy } from "lodash-es";
import { resolveChaiFont } from "~/registry/fonts";
import type { ChaiFontBySrc, ChaiFontByUrl } from "~/types";
import type { ChaiTheme, ChaiThemeOptions } from "~/types/chaibuilder-editor-props";

export const getChaiThemeOptions = (chaiThemeOptions: ChaiThemeOptions) => {
  const theme = {
    fontFamily: chaiThemeOptions.fontFamily
      ? keys(chaiThemeOptions.fontFamily).reduce(
          (acc, key) => ({
            ...acc,
            [key.replace("font-", "")]: `var(--${key})`,
          }),
          {},
        )
      : {},
    borderRadius: chaiThemeOptions.borderRadius
      ? {
          lg: `var(--radius)`,
          md: `calc(var(--radius) - 2px)`,
          sm: `calc(var(--radius) - 4px)`,
        }
      : {},
    colors: chaiThemeOptions.colors
      ? flatten(chaiThemeOptions.colors.map((color) => Object.entries(color.items))).reduce(
          (acc, [key]) => ({ ...acc, [key]: `hsl(var(--${key}))` }),
          {},
        )
      : {},
  };
  return theme;
};

/**
 * Tailwind v4 has no JS config, so the theme has to reach the canvas as CSS. `@theme static` is
 * required: `inline` never emits the variables, and a plain `@theme` emits only the ones a
 * generated utility happens to reference, which drops the vars the canvas base styles and
 * arbitrary values read. Colors stay wrapped as `hsl(var(--primary))` so the `.dark` overrides from
 * `getChaiThemeCssVariables` keep resolving on the same `html` element. Fonts go through a
 * `--chai-font-*` alias because Tailwind's `--font-*` namespace collides with the Chai variable
 * name, and `--font-heading: var(--font-heading)` would be a self-reference.
 */
export const getChaiThemeCssTheme = (chaiThemeOptions: ChaiThemeOptions): string => {
  const fontKeys = keys(chaiThemeOptions.fontFamily || {});
  const colorKeys = flatten((chaiThemeOptions.colors || []).map((color) => keys(color.items)));

  const fontAliases = fontKeys.map((key) => `--chai-${key}: var(--${key});`);
  const themeEntries = [
    ...fontKeys.map((key) => `--font-${key.replace("font-", "")}: var(--chai-${key});`),
    ...(chaiThemeOptions.borderRadius
      ? [
          "--radius-lg: var(--radius);",
          "--radius-md: calc(var(--radius) - 2px);",
          "--radius-sm: calc(var(--radius) - 4px);",
        ]
      : []),
    ...colorKeys.map((key) => `--color-${key}: hsl(var(--${key}));`),
  ];

  return `:root {
    ${fontAliases.join("\n    ")}
  }
  @theme static {
    ${themeEntries.join("\n    ")}

    --animate-accordion-down: accordion-down 0.2s ease-out;
    --animate-accordion-up: accordion-up 0.2s ease-out;

    @keyframes accordion-down {
      from { height: 0; }
      to { height: var(--radix-accordion-content-height); }
    }

    @keyframes accordion-up {
      from { height: var(--radix-accordion-content-height); }
      to { height: 0; }
    }
  }
  @layer base {
    h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); }
    body {
      font-family: var(--font-body);
      color: hsl(var(--foreground));
      background-color: hsl(var(--background));
    }
  }`;
};

export function hexToHSL(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  let r = parseInt(result![1], 16);
  let g = parseInt(result![2], 16);
  let b = parseInt(result![3], 16);
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  ((r /= 255), (g /= 255), (b /= 255));
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max == min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const getFontFamily = (font: string) => {
  const fallback = get(resolveChaiFont(font), "fallback", "");
  // A font with no fallback would otherwise leave a trailing comma, which makes the whole
  // font-family declaration invalid and silently drops the font.
  return fallback ? `"${font}", ${fallback}` : `"${font}"`;
};

export const getChaiThemeCssVariables = ({ theme }: { theme: ChaiTheme }) => {
  const chaiTheme = theme;
  return `:root {
    ${
      theme.fontFamily
        ? Object.entries(theme.fontFamily)
            .map(([key, value]) => `--font-${key}: ${getFontFamily(value)};`)
            .join("\n    ")
        : ""
    }
    ${chaiTheme.borderRadius ? `--radius: ${chaiTheme.borderRadius};` : ""}
    ${
      chaiTheme.colors
        ? Object.entries(chaiTheme.colors)
            .map(([key, value]) => `--${key}: ${hexToHSL(value[0])};`)
            .join("\n    ")
        : ""
    }
  }
  .dark {
    ${
      chaiTheme.colors
        ? Object.entries(chaiTheme.colors)
            .map(([key, value]) => `--${key}: ${hexToHSL(value[1])};`)
            .join("\n    ")
        : ""
    }
  }`;
};

export const getChaiThemeFontsLinkMarkup = (fonts: ChaiFontByUrl[]) => {
  if (!fonts || fonts.length === 0) return "";

  return uniqBy(fonts, "family")
    .map((font: ChaiFontByUrl) => `<link rel="stylesheet" href="${font.url}" />`)
    .join("\n");
};

export const getThemeFontsUrls = (fonts: ChaiFontByUrl[]) => {
  if (!fonts || fonts.length === 0) return [];

  // Dedupe by URL as well as family: two families can share one bundled stylesheet
  // (e.g. a single Google Fonts URL for heading + body). Consumers key <link>s by URL.
  return uniq(uniqBy(fonts, "family").map((font: ChaiFontByUrl) => font.url));
};

export const getChaiThemeFontsCssImport = (fonts: ChaiFontByUrl[]) => {
  if (!fonts || fonts.length === 0) return "";

  return uniqBy(fonts, "family")
    .map((font: ChaiFontByUrl) => `@import url("${font.url}");`)
    .join("\n");
};

export const getThemeCustomFontFace = (fonts: ChaiFontBySrc[]) => {
  if (!fonts || fonts.length === 0) return "";

  return uniqBy(fonts, "family")
    .map((font: ChaiFontBySrc) =>
      font.src
        .map(
          (source) => `@font-face {
        font-family: "${font.family}";
        src: url("${source.url}") format("${source.format}");
        font-display: swap;
        ${source.fontWeight ? `font-weight: ${source.fontWeight};` : ""}
        ${source.fontStyle ? `font-style: ${source.fontStyle};` : ""}
        ${source.fontStretch ? `font-stretch: ${source.fontStretch};` : ""}
      }`,
        )
        .join("\n"),
    )
    .join("\n");
};
