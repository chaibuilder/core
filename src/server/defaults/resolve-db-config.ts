import type { ChaiDbSetup } from "./types";

/** Validates `db` from `buildChaiBuilderConfig`. */
export function resolveChaiDbConfig(input: ChaiDbSetup | undefined): ChaiDbSetup {
  if (!input || typeof input !== "object") {
    throw new Error(
      "ChaiBuilder: `db` is required in `buildChaiBuilderConfig`. Pass `db: createPostgresDB(...)` (or libsql/d1/better-sqlite3).",
    );
  }
  if (!input.drizzle) {
    throw new Error(
      "ChaiBuilder: `db` is required in `buildChaiBuilderConfig`. Pass `db: createPostgresDB(...)` (or libsql/d1/better-sqlite3).",
    );
  }
  return input;
}
