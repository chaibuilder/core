import { mergeDesignTokens, resolveDesignToken } from "~/render/resolve-design-token";
import type { ChaiSiteLayout, ChaiTheme } from "~/types/chaibuilder-editor-props";
import type { ChaiDesignTokens } from "~/types/types";

export const SITE_LAYOUT_TOKENS: Record<ChaiSiteLayout, string> = {
  fluid: "dt#layout-fluid",
  container: "dt#layout-container",
  narrow: "dt#layout-narrow",
};

export const SITE_LAYOUT_WIDTHS: Record<ChaiSiteLayout, string> = {
  fluid: "none",
  container: "1280px",
  narrow: "768px",
};

const NOT_POSITIONED = ":not(.fixed):not(.absolute)";

// Live: the renderer marks each top-level block's root element.
export const ROOT_BLOCK_PROPS = { "data-root-block": "" };
export const LIVE_LAYOUT_SELECTOR = `[data-root-block]${NOT_POSITIONED}`;

const UNWRAPPED_PARTIAL = `:is([data-block-type="PartialBlock"], [data-block-type="GlobalBlock"]):not([data-partial-wrapper])`;

// Canvas: blocks sit in #canvas; partials without a wrapper tag are stepped through to match live.
export const CANVAS_LAYOUT_SELECTOR = [
  `#canvas > [data-block-id]:not(${UNWRAPPED_PARTIAL})${NOT_POSITIONED}`,
  `#canvas > ${UNWRAPPED_PARTIAL} > [data-block-id]${NOT_POSITIONED}`,
].join(", ");

export const getSiteLayoutClasses = (theme: Partial<ChaiTheme> | undefined, designTokens?: ChaiDesignTokens) => {
  const token = theme?.siteLayout ? SITE_LAYOUT_TOKENS[theme.siteLayout] : undefined;
  return token ? resolveDesignToken(mergeDesignTokens(designTokens), token) : "";
};

export const getSiteContentWidthCss = (theme: Partial<ChaiTheme> | undefined) => {
  const width = theme?.siteLayout ? SITE_LAYOUT_WIDTHS[theme.siteLayout] : undefined;
  return width ? `:root { --site-content-width: ${width}; }` : "";
};
