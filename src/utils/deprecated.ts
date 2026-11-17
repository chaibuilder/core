/**
 * Deprecated names of `<pkg>/utils`, re-exported by `./index.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `generateUuid` from `<pkg>/utils`. Kept for compatibility. */
  generateUuid as generateUUID,
} from "~/builder/core/functions/common-functions";

export {
  /** @deprecated Use `applyChaiDesignTokens` from `<pkg>/utils`. Kept for compatibility. */
  applyChaiDesignTokens as applyDesignTokens,
} from "~/utils/apply-design-tokens";

export {
  /** @deprecated Use `applyChaiRepeaterQuery` from `<pkg>/utils`. Kept for compatibility. */
  applyChaiRepeaterQuery as applyRepeaterQuery,
} from "~/utils/apply-repeater-query";

export {
  /** @deprecated Use `parseChaiBlocksFromHtml` from `<pkg>/utils`. Kept for compatibility. */
  parseChaiBlocksFromHtml as convertHTMLToChaiBlocks,
} from "~/utils/convert-html-to-chai-blocks";

export {
  /** @deprecated Use `parseChaiBlocksFromChaiFile` from `<pkg>/utils`. Kept for compatibility. */
  parseChaiBlocksFromChaiFile as convertToBlocks,
} from "~/utils/convert-to-blocks";

export {
  /** @deprecated Use `getChaiTailwindTheme` from `<pkg>/utils`. Kept for compatibility. */
  getChaiTailwindTheme as getChaiBuilderTheme,
} from "~/utils/get-chai-builder-theme";

export {
  /** @deprecated Use `chaiTailwindPlugin` from `<pkg>/utils`. Kept for compatibility. */
  default as chaiBuilderPlugin,
} from "~/utils/plugin";
