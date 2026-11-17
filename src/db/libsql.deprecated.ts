/**
 * Deprecated names of `<pkg>/db/libsql`, re-exported by `./libsql.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `LibsqlClient` from `<pkg>/db/libsql`. Kept for compatibility. */
  type Client as LibSqlClient,
} from "@libsql/client";

export {
  /** @deprecated Use `createLibsqlDb` from `<pkg>/db/libsql`. Kept for compatibility. */
  createLibsqlDb as createLibsqlDB,
  /** @deprecated Use `createLibsqlInstance` from `<pkg>/db/libsql`. Kept for compatibility. */
  createLibsqlInstance as createLibSqlInstance,
  /** @deprecated Use `CreateLibsqlDbOptions` from `<pkg>/db/libsql`. Kept for compatibility. */
  type CreateLibsqlDbOptions as LibsqlDbInput,
} from "~/db/libsql";
