/**
 * Deprecated names of `<pkg>/nextjs/render`, re-exported by `./render.tsx`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `getChaiThemeFontsCssImport` from `<pkg>/nextjs/render`. Kept for compatibility. */
  getChaiThemeFontsCssImport as getThemeFontsCSSImport,
  /** @deprecated Use `getChaiThemeFontsLinkMarkup` from `<pkg>/nextjs/render`. Kept for compatibility. */
  getChaiThemeFontsLinkMarkup as getThemeFontsLinkMarkup,
} from "~/builder/core/components/canvas/static/chai-theme-helpers";

export {
  /** @deprecated Use `getChaiMergedPartialBlocks` from `<pkg>/nextjs/render`. Kept for compatibility. */
  getChaiMergedPartialBlocks as getMergedPartialBlocks,
} from "~/render/functions";

export {
  /** @deprecated Use `getChaiBlocksStyles` from `<pkg>/nextjs/render`. Kept for compatibility. */
  getChaiBlocksStyles as getStylesForBlocks,
} from "~/render/get-tailwind-css";

export {
  /** @deprecated Use `ChaiPageCss` from `<pkg>/nextjs/render`. Kept for compatibility. */
  ChaiPageCss as ChaiPageCSS,
  /** @deprecated Use `ChaiPageJsonLd` from `<pkg>/nextjs/render`. Kept for compatibility. */
  ChaiPageJsonLd as ChaiPageJSONLD,
} from "~/render/rsc/chai-page-head-tags";

export {
  /** @deprecated Use `ChaiBlocksRenderer` from `<pkg>/nextjs/render`. Kept for compatibility. */
  ChaiBlocksRenderer as RenderChaiBlocks,
} from "~/render/rsc/next-render-chai-blocks";

export {
  /** @deprecated Use `ChaiPageScripts` from `<pkg>/nextjs/render`. Kept for compatibility. */
  ChaiPageScripts as PageScripts,
} from "~/render/rsc/page-scripts";

export {
  /** @deprecated Use `ChaiLayout` from `<pkg>/nextjs/render`. Kept for compatibility. */
  ChaiLayout as WithChaiLayout,
} from "~/render/rsc/with-chai-layout";
