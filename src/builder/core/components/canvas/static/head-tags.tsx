import containerQueries from "@tailwindcss/container-queries";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import { compact, filter, get, has, map, uniq } from "lodash-es";
import { memo, useEffect, useMemo } from "react";
import plugin from "tailwindcss/plugin";
import {
  getChaiThemeCssTheme,
  getChaiThemeOptions,
  getThemeCustomFontFace,
  getThemeFontsUrls,
} from "~/builder/core/components/canvas/static/chai-theme-helpers";
import {
  TAILWIND_THEME_STYLE_ID,
  V3_SCREEN_HEIGHT_THEME,
} from "~/builder/core/components/canvas/IframeInitialContent";
import { CssThemeVariables } from "~/builder/core/components/css-theme-var";
import { useFrame } from "~/builder/core/frame";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";
import { useTheme, useThemeOptions } from "~/builder/hooks/use-theme";
import { resolveFont } from "~/registry/fonts";
import { ChaiFont, ChaiFontBySrc, ChaiFontByUrl, ChaiTheme } from "~/types";
import type { ChaiThemeOptions } from "~/types/chaibuilder-editor-props";
import { getSiteContentWidthCss } from "~/utils/site-layout-css";

const useDarkModeEffect = (darkMode: boolean, iframeDoc: Document | undefined) => {
  useEffect(() => {
    if (darkMode) iframeDoc?.documentElement.classList.add("dark");
    else iframeDoc?.documentElement.classList.remove("dark");
  }, [darkMode, iframeDoc]);
};

const useTailwindConfig = (chaiTheme: any, chaiThemeOptions: any, iframeWin: Window | undefined, enabled: boolean) => {
  useEffect(() => {
    const win = iframeWin as any;
    if (!enabled || !win || !win.tailwind) return;
    const newConfig = {
      darkMode: "class",
      theme: {
        extend: {
          container: {
            center: true,
            padding: "1rem",
            screens: {
              "2xl": "1400px",
            },
          },
          ...V3_SCREEN_HEIGHT_THEME,
          ...getChaiThemeOptions(chaiThemeOptions),
        },
      },

      plugins: [
        typography,
        forms,
        containerQueries,
        plugin(function ({ addBase, theme }: any) {
          addBase({
            "h1,h2,h3,h4,h5,h6": {
              fontFamily: theme("fontFamily.heading"),
            },
            body: {
              fontFamily: theme("fontFamily.body"),
              color: theme("colors.foreground"),
              backgroundColor: theme("colors.background"),
            },
          });
        }),
      ],
    };
    Object.assign(win.tailwind.config, newConfig);
  }, [chaiTheme, chaiThemeOptions, iframeWin, enabled]);
};

/**
 * Writes the theme into the placeholder that ships with the iframe content rather than rendering
 * a style element. The v4 browser build only re-reads stylesheets on a "full" rebuild, and it
 * watches a style's content only once a compile has seen the element, so filling a known
 * placeholder is what reliably triggers the rebuild.
 */
export const TailwindV4Theme = ({
  chaiThemeOptions,
  layoutCss = "",
}: {
  chaiThemeOptions: ChaiThemeOptions;
  layoutCss?: string;
}) => {
  const { document: iframeDoc } = useFrame();
  const themeCss = useMemo(
    () => `${getChaiThemeCssTheme(chaiThemeOptions)}\n${layoutCss}`,
    [chaiThemeOptions, layoutCss],
  );

  useEffect(() => {
    const themeStyle = iframeDoc?.getElementById(TAILWIND_THEME_STYLE_ID);
    if (themeStyle) themeStyle.textContent = themeCss;
  }, [iframeDoc, themeCss]);

  return null;
};

const useSelectedStylingBlocksStyles = () => {
  const [selectedStylingBlocks] = useSelectedStylingBlocks();
  const [selectedBlockIds] = useSelectedBlockIds();

  return useMemo(() => {
    return `${map(selectedStylingBlocks, ({ id }: any) => `[data-style-id="${id}"]`).join(",")}{
                outline: 1px solid ${selectedBlockIds.length > 0 ? "#42a1fc" : "#de8f09"} !important; outline-offset: -1px;
            }`;
  }, [selectedStylingBlocks, selectedBlockIds]);
};

const useSelectedBlocksStyles = () => {
  const [selectedBlockIds] = useSelectedBlockIds();

  return useMemo(() => {
    return `${map(selectedBlockIds, (id) => `[data-block-id="${id}"]`).join(",")}{
                outline: 1px solid #42a1fc !important; outline-offset: -1px;
            }`;
  }, [selectedBlockIds]);
};

const useThemeFonts = () => {
  const [chaiTheme] = useTheme();

  const pickedFonts = useMemo(() => {
    const { heading, body } = {
      heading: get(chaiTheme, "fontFamily.heading"),
      body: get(chaiTheme, "fontFamily.body"),
    };
    return uniq(compact([heading, body])).map(resolveFont).filter(Boolean) as ChaiFont[];
  }, [chaiTheme]);

  const fonts = useMemo(
    () => getThemeFontsUrls(filter(pickedFonts, (font) => has(font, "url")) as ChaiFontByUrl[]),
    [pickedFonts],
  );

  const customFonts = useMemo(
    () => getThemeCustomFontFace(filter(pickedFonts, (font) => has(font, "src")) as ChaiFontBySrc[]),
    [pickedFonts],
  );

  return { fonts, customFonts };
};

// ============ Components ============

// Canvas <style> elements render their CSS as a TEXT CHILD, never through
// dangerouslySetInnerHTML: React 19 re-assigns innerHTML whenever the inline
// `{ __html }` object identity changes — i.e. on every render, even when the CSS
// string is identical — which replaces the style's text node. For the @font-face
// sheet that resets every FontFace to "unloaded" and, with font-display: swap,
// paints one frame in the fallback font on every block selection (visible font
// flicker in the builder). A string child is only written when it changes.
const SelectedStylingBlocks = () => {
  const styles = useSelectedStylingBlocksStyles();
  return <style id="selected-styling-blocks">{styles}</style>;
};

const SelectedBlocks = () => {
  const styles = useSelectedBlocksStyles();
  return <style id="selected-blocks">{styles}</style>;
};

const Fonts = memo(function Fonts() {
  const { fonts, customFonts } = useThemeFonts();
  return (
    <>
      {fonts.map((font) => (
        <link key={font} rel="stylesheet" href={font} />
      ))}
      <style id="chai-custom-fonts">{customFonts}</style>
    </>
  );
});

export const HeadTags = () => {
  const [chaiTheme] = useTheme();
  const chaiThemeOptions = useThemeOptions();
  const [darkMode] = useDarkMode();
  const { document: iframeDoc, window: iframeWin } = useFrame();
  const tailwindCSS = useBuilderProp<"3" | "4">("tailwindCSS", "4");
  const canvasStyles = useBuilderProp<string>("canvasStyles", "");
  const layoutCss = useMemo(() => getSiteContentWidthCss(chaiTheme), [chaiTheme]);

  useDarkModeEffect(darkMode, iframeDoc);
  useTailwindConfig(chaiTheme, chaiThemeOptions, iframeWin, tailwindCSS === "3");

  return (
    <>
      <CssThemeVariables theme={chaiTheme as ChaiTheme} />
      {tailwindCSS === "4" ? <TailwindV4Theme chaiThemeOptions={chaiThemeOptions} layoutCss={layoutCss} /> : null}
      <Fonts />
      {/* Text child (not innerHTML): the canvas is client-rendered so this lands as textContent — no
          `</style>` breakout if a host ever passes untrusted CSS, and selectors like `a > b` are intact. */}
      {canvasStyles ? <style id="chai-canvas-styles">{canvasStyles}</style> : null}
      <SelectedBlocks />
      <SelectedStylingBlocks />
    </>
  );
};
