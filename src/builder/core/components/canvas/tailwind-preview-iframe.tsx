import containerQueries from "@tailwindcss/container-queries";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import { compact, filter, get, has, uniq } from "lodash-es";
import React, { useEffect, useMemo } from "react";
import plugin from "tailwindcss/plugin";
import { getIframeInitialContent } from "~/builder/core/components/canvas/IframeInitialContent";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import {
  getChaiThemeOptions,
  getThemeCustomFontFace,
  getThemeFontsUrls,
} from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { TailwindV4Theme } from "~/builder/core/components/canvas/static/head-tags";
import { CssThemeVariables } from "~/builder/core/components/css-theme-var";
import { ChaiFrame, useFrame } from "~/builder/core/frame";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { useTheme, useThemeOptions } from "~/builder/hooks/use-theme";
import { resolveFont } from "~/registry/fonts";
import { ChaiFont, ChaiFontBySrc, ChaiFontByUrl, ChaiTheme } from "~/types";
import { useInnerHtml } from "~/web-blocks/use-inner-html";

const PreviewHeadTags = () => {
  const [chaiTheme] = useTheme();
  const chaiThemeOptions = useThemeOptions();
  const [darkMode] = useDarkMode();
  const { document: iframeDoc, window: iframeWin } = useFrame();
  const tailwindCSS = useBuilderProp<"3" | "4">("tailwindCSS", "4");

  useEffect(() => {
    if (darkMode) iframeDoc?.documentElement.classList.add("dark");
    else iframeDoc?.documentElement.classList.remove("dark");
  }, [darkMode, iframeDoc]);

  useEffect(() => {
    const win = iframeWin as any;
    if (tailwindCSS !== "3" || !win || !win.tailwind) return;
    const tailwindConfig = {
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
    Object.assign(win.tailwind, { config: tailwindConfig });
  }, [chaiTheme, chaiThemeOptions, iframeWin, tailwindCSS]);

  const pickedFonts = useMemo(() => {
    const heading = get(chaiTheme, "fontFamily.heading");
    const body = get(chaiTheme, "fontFamily.body");
    return uniq(compact([heading, body])).map(resolveFont).filter(Boolean) as ChaiFont[];
  }, [chaiTheme]);

  const fontUrls = useMemo(
    () => getThemeFontsUrls(filter(pickedFonts, (font) => has(font, "url")) as ChaiFontByUrl[]),
    [pickedFonts],
  );
  const customFontFaces = useMemo(
    () => getThemeCustomFontFace(filter(pickedFonts, (font) => has(font, "src")) as ChaiFontBySrc[]),
    [pickedFonts],
  );

  return (
    <>
      <CssThemeVariables theme={chaiTheme as ChaiTheme} />
      {tailwindCSS === "4" ? <TailwindV4Theme chaiThemeOptions={chaiThemeOptions} /> : null}
      {fontUrls.map((url) => (
        <link key={url} rel="stylesheet" href={url} />
      ))}
      {/* Text child, not innerHTML — see head-tags.tsx (React 19 re-applies inline {__html} every render). */}
      <style id="chai-custom-fonts">{customFontFaces}</style>
    </>
  );
};

interface TailwindPreviewIframeProps {
  content: string;
  classes?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Classes for the wrapper inside the iframe document (e.g. a surface colour over the themed body). */
  wrapperClassName?: string;
}

export const TailwindPreviewIframe = ({
  content,
  classes = "",
  className = "w-full rounded border-0",
  style = { minHeight: 80 },
  title = "Preview",
  wrapperClassName = "",
}: TailwindPreviewIframeProps) => {
  const tailwindCSS = useBuilderProp<"3" | "4">("tailwindCSS", "4");
  const initialContent = useMemo(() => getIframeInitialContent({ htmlDir: "ltr", tailwindCSS }), [tailwindCSS]);
  const innerHtml = useInnerHtml(content);

  return (
    <ChaiFrame className={className} style={style} title={title as any} initialContent={initialContent}>
      <PreviewHeadTags />
      <div className={`h-full p-4 ${wrapperClassName}`}>
        <div className={classes || undefined} dangerouslySetInnerHTML={innerHtml} />
      </div>
    </ChaiFrame>
  );
};
