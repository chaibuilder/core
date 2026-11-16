import { is, sql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "~/edition/test-schema";
import { seedTestApp } from "./test-app";
import type { TestDb } from "./test-db";

const TABLES = (Object.values(schema) as unknown[]).filter((table): table is SQLiteTable => is(table, SQLiteTable));

/** Empties every table and re-seeds the test app. Runs after each test; cheap on an in-memory DB. */
export async function resetTestData(db: TestDb): Promise<void> {
  db.run(sql`PRAGMA foreign_keys = OFF`);
  for (const table of TABLES) {
    await db.delete(table);
  }
  db.run(sql`PRAGMA foreign_keys = ON`);
  await seedTestApp(db);
}
