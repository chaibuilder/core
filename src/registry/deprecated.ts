/**
 * Deprecated names of `<pkg>/registry`, re-exported by `./index.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `getRegisteredChaiFonts` from `<pkg>/registry`. Kept for compatibility. */
  getRegisteredChaiFonts as getAllRegisteredFonts,
  /** @deprecated Use `getChaiFontStyles` from `<pkg>/registry`. Kept for compatibility. */
  getChaiFontStyles as getFontStyles,
  /** @deprecated Use `getRegisteredChaiFont` from `<pkg>/registry`. Kept for compatibility. */
  getRegisteredChaiFont as getRegisteredFont,
  /** @deprecated Use `resolveChaiFont` from `<pkg>/registry`. Kept for compatibility. */
  resolveChaiFont as resolveFont,
  /** @deprecated Use `useRegisteredChaiFonts` from `<pkg>/registry`. Kept for compatibility. */
  useRegisteredChaiFonts as useRegisteredFonts,
} from "~/registry/fonts";

export {
  /** @deprecated Use `getRegisteredChaiBlocks` from `<pkg>/registry`. Kept for compatibility. */
  getRegisteredChaiBlocks as getAllRegisteredChaiBlocks,
  /** @deprecated Use `getChaiBlockAiProps` from `<pkg>/registry`. Kept for compatibility. */
  getChaiBlockAiProps as getBlockAIProps,
  /** @deprecated Use `getChaiBlockDefaultProps` from `<pkg>/registry`. Kept for compatibility. */
  getChaiBlockDefaultProps as getBlockDefaultProps,
  /** @deprecated Use `getChaiBlockFormSchemas` from `<pkg>/registry`. Kept for compatibility. */
  getChaiBlockFormSchemas as getBlockFormSchemas,
  /** @deprecated Use `registerChaiBlockComponent` from `<pkg>/registry`. Kept for compatibility. */
  registerChaiBlockComponent as setChaiBlockComponent,
  /** @deprecated Use `syncChaiBlocksWithDefaultProps` from `<pkg>/registry`. Kept for compatibility. */
  syncChaiBlocksWithDefaultProps as syncBlocksWithDefaultProps,
} from "~/registry/v2/runtime";
