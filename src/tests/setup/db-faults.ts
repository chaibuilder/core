import { getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getTestSqlite } from "./test-db";

/**
 * Makes `table` genuinely unavailable while `fn` runs (renamed away, so every query against it
 * fails with a real "no such table" error), then puts it back. Use it to exercise error paths
 * instead of stubbing the database layer.
 */
export async function withTableUnavailable<T>(table: SQLiteTable, fn: () => Promise<T> | T): Promise<T> {
  const sqlite = getTestSqlite();
  const name = getTableName(table);
  const hidden = `${name}__unavailable`;
  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`ALTER TABLE "${name}" RENAME TO "${hidden}"`);
  try {
    return await fn();
  } finally {
    sqlite.exec(`ALTER TABLE "${hidden}" RENAME TO "${name}"`);
    sqlite.pragma("foreign_keys = ON");
  }
}
