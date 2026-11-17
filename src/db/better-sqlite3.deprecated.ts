/**
 * Deprecated names of `<pkg>/db/better-sqlite3`, re-exported by `./better-sqlite3.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `CreateBetterSqliteDbOptions` from `<pkg>/db/better-sqlite3`. Kept for compatibility. */
  type CreateBetterSqliteDbOptions as BetterSqliteDbInput,
  /** @deprecated Use `createBetterSqliteDb` from `<pkg>/db/better-sqlite3`. Kept for compatibility. */
  createBetterSqliteDb as createBetterSqliteDB,
} from "~/db/better-sqlite3";
