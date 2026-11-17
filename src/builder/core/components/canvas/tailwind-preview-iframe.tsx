import { compact, filter, get, has, uniq } from "lodash-es";
import React, { useEffect, useMemo } from "react";
import { getIframeInitialContent } from "~/builder/core/components/canvas/IframeInitialContent";
import { getThemeCustomFontFace, getThemeFontsUrls } from "~/builder/core/components/canvas/static/chai-theme-helpers";
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
  const { document: iframeDoc } = useFrame();

  useEffect(() => {
    if (darkMode) iframeDoc?.documentElement.classList.add("dark");
    else iframeDoc?.documentElement.classList.remove("dark");
  }, [darkMode, iframeDoc]);

  const pickedFonts = useMemo(() => {
    const heading = get(chaiTheme, "fontFamily.heading");
    const body = get(chaiTheme, "fontFamily.body");
    return uniq(compact([heading, body]))
      .map(resolveFont)
      .filter(Boolean) as ChaiFont[];
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
      <TailwindV4Theme chaiThemeOptions={chaiThemeOptions} />
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
  const initialContent = useMemo(() => getIframeInitialContent({ htmlDir: "ltr" }), []);
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
