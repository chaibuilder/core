import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createBetterSqliteDb } from "~/db/better-sqlite3";
import { registerChaiDb, type ChaiDbSetup } from "~/db/core";
import * as schema from "~/edition/test-schema";

export type TestDb = BetterSQLite3Database<typeof schema>;

let client: Database.Database | null = null;
let instance: TestDb | null = null;
let setup: ChaiDbSetup | null = null;

/**
 * The raw better-sqlite3 connection for this vitest worker. Each fork worker owns one private
 * in-memory database, so test files never share rows and need no network, file or env setup.
 */
export function getTestSqlite(): Database.Database {
  if (!client) {
    client = new Database(":memory:");
    client.pragma("foreign_keys = ON");
  }
  return client;
}

/** Drizzle over the worker's in-memory database, typed with the full edition schema. */
export function getTestDb(): TestDb {
  return (instance ??= drizzle(getTestSqlite(), { schema }));
}

/** The same database as a ChaiBuilder `db` setup — what `buildChaiBuilderConfig({ db })` receives. */
export function getTestDbSetup(): ChaiDbSetup {
  return (setup ??= createBetterSqliteDb({ drizzle: getTestDb(), schema }));
}

/** Points ChaiBuilder's `db` singleton at the worker's real in-memory database. */
export function registerTestDb(): void {
  registerChaiDb(getTestDbSetup());
}

export { schema };
