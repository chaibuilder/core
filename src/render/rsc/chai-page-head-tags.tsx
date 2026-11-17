import { get } from "lodash-es";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { getChaiFontStyles } from "~/registry";
import { getChaiThemeCssVariables } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { getChaiBuilder } from "~/server/get-chaibuilder";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { ChaiDesignTokens, ChaiTheme } from "~/types";
import type { ChaiFullPage } from "~/types/pages";
import { applyChaiDesignTokens } from "~/utils";
import { getSiteContentWidthCss } from "~/utils/site-layout-css";
import { JSONLD } from "./json-ld";

/**
 * Content hash for the hoistable font-face style's `href`. Stable for identical
 * CSS (so React 19 dedupes it across navigations) and changes when the theme
 * font changes. Same djb2/sdbm scheme as the app's `utils/styles-helper`, kept
 * local so the SDK stays self-contained.
 */
const hashStyleKey = (css: string): string => {
  let djb2 = 5381;
  let sdbm = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css.charCodeAt(i);
    djb2 = ((djb2 << 5) + djb2 + c) >>> 0;
    sdbm = (c + (sdbm << 6) + (sdbm << 16) - sdbm) >>> 0;
  }
  return `${djb2.toString(36)}-${sdbm.toString(36)}`;
};

export const ChaiPageCss = async (props: { page: ChaiFullPage }) => {
  const { page } = props;
  const chaiBuilder = await getChaiBuilder(getActiveChaiBuilderConfig());
  const withPhase = chaiBuilder.withRenderPhase;

  const siteSettings = await withPhase("ChaiPageCSS.getSiteSettings", () => chaiBuilder.getSiteSettings());
  const theme = get(siteSettings, "theme", {}) as ChaiTheme;
  const designTokens = {
    ...CHAI_BUILT_IN_DESIGN_TOKENS,
    ...(get(siteSettings, "designTokens", {}) as ChaiDesignTokens),
  };
  const themeCssVariables = await withPhase("ChaiPageCSS.themeVariables", async () =>
    getChaiThemeCssVariables({ theme }),
  );
  const pageBlocks = await withPhase("ChaiPageCSS.applyDesignTokens", async () =>
    applyChaiDesignTokens(page.blocks ?? [], designTokens),
  );
  const pageStyles = page
    ? await withPhase("ChaiPageCSS.getPageStyles", () => chaiBuilder.getPageStyles(page.id, pageBlocks, page.upstream))
    : null;
  const styles = [getSiteContentWidthCss(theme), pageStyles].filter(Boolean).join(" ");
  const bodyFont = get(theme, "fontFamily.body", "Arial");
  const headingFont = get(theme, "fontFamily.heading", "Arial");
  const { fontStyles, preloads } = await withPhase("ChaiPageCSS.getFontStyles", () =>
    getChaiFontStyles(headingFont, bodyFont),
  );

  return (
    <>
      {preloads.length > 0 &&
        preloads.map((preload: string) => (
          <link key={preload} rel="preload" href={preload} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      <style id="theme-variables" dangerouslySetInnerHTML={{ __html: themeCssVariables }} />
      {fontStyles ? (
        /* @font-face must be a HOISTABLE style (href + precedence) so React 19
           dedupes it across soft navigations instead of remounting it. A remount
           resets the browser's FontFace objects and re-runs their async load,
           painting fallback for 1-2 frames on every navigation (the font flash). */
        <style
          href={`chai-font-faces-${hashStyleKey(fontStyles)}`}
          precedence="chai-fonts"
          dangerouslySetInnerHTML={{ __html: fontStyles }}
        />
      ) : null}
      {styles ? <style id="page-styles" dangerouslySetInnerHTML={{ __html: styles }} /> : null}
    </>
  );
};

/**
 * Site-wide theme tokens + fonts, without any page styles.
 *
 * Same head tags as `ChaiPageCss` minus `#page-styles`, for routes that render
 * their own markup instead of builder blocks and so have no `page` to style.
 * Tailwind utilities for such routes come from the app's own compiled CSS.
 */
export const ChaiSiteTheme = async () => {
  const chaiBuilder = await getChaiBuilder(getActiveChaiBuilderConfig());
  const withPhase = chaiBuilder.withRenderPhase;

  const siteSettings = await withPhase("ChaiSiteTheme.getSiteSettings", () => chaiBuilder.getSiteSettings());
  const theme = get(siteSettings, "theme", {}) as ChaiTheme;
  const themeCssVariables = await withPhase("ChaiSiteTheme.themeVariables", async () =>
    getChaiThemeCssVariables({ theme }),
  );
  const bodyFont = get(theme, "fontFamily.body", "Arial");
  const headingFont = get(theme, "fontFamily.heading", "Arial");
  const { fontStyles, preloads } = await withPhase("ChaiSiteTheme.getFontStyles", () =>
    getChaiFontStyles(headingFont, bodyFont),
  );

  return (
    <>
      {preloads.length > 0 &&
        preloads.map((preload: string) => (
          <link key={preload} rel="preload" href={preload} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      <style id="theme-variables" dangerouslySetInnerHTML={{ __html: themeCssVariables }} />
      {fontStyles ? (
        /* @font-face must be a HOISTABLE style (href + precedence) so React 19
           dedupes it across soft navigations instead of remounting it. A remount
           resets the browser's FontFace objects and re-runs their async load,
           painting fallback for 1-2 frames on every navigation (the font flash). */
        <style
          href={`chai-font-faces-${hashStyleKey(fontStyles)}`}
          precedence="chai-fonts"
          dangerouslySetInnerHTML={{ __html: fontStyles }}
        />
      ) : null}
    </>
  );
};

export const ChaiPageJsonLd = async (props: { page: ChaiFullPage; pageData?: Record<string, any> }) => {
  const { page, pageData = {} } = props;
  return <JSONLD jsonLD={page?.seo?.jsonLD} pageData={pageData} />;
};
