/**
 * Deprecated names of `<pkg>/db/d1`, re-exported by `./d1.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `createD1Db` from `<pkg>/db/d1`. Kept for compatibility. */
  createD1Db as createD1DB,
  /** @deprecated Use `CreateD1DbOptions` from `<pkg>/db/d1`. Kept for compatibility. */
  type CreateD1DbOptions as D1DbInput,
} from "~/db/d1";
