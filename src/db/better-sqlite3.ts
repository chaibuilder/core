import { getDrizzleCasing, getMappedDrizzleClient, mapChaiTables, type ChaiTableMapping } from "~/db/table-mapping";
import Database from "better-sqlite3";
import { drizzle as drizzleBetterSqlite3, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/drizzle/schema.sqlite";
import { asDbInstance, type ChaiDbSetup } from "~/db/core";
import { chaiDrizzleLogger } from "~/db/logger";

/**
 * `tables` is the drizzle schema record to run on (tables and, optionally, relations); defaults
 * to the core tables under the default naming. Pass `createChaiSqliteSchema(naming).schema` for a
 * programmatic naming. `schema` is the older spelling of the same option.
 */
export type BetterSqliteDbInput =
  | {
      file: string;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    }
  | {
      drizzle: BetterSQLite3Database<any>;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    };

function assertSingleBetterSqliteInput(input: BetterSqliteDbInput): void {
  const count = Number("file" in input) + Number("drizzle" in input);
  if (count !== 1) {
    throw new Error("ChaiBuilder: createBetterSqliteDB expects exactly one of `file` or `drizzle`.");
  }
}

/** Creates a better-sqlite3 Drizzle setup for `buildChaiBuilderConfig({ db: ... })`. */
export function createBetterSqliteDB(input: BetterSqliteDbInput): ChaiDbSetup {
  assertSingleBetterSqliteInput(input);

  const activeSchema = mapChaiTables(input.tables ?? input.schema ?? schema, input.tableMapping, schema);
  const schemas = { schema: activeSchema, schemaDefaults: schema, tableMapping: input.tableMapping };

  if ("drizzle" in input && input.tableMapping && Object.keys(input.tableMapping).length > 0) {
    const client = getMappedDrizzleClient<Database.Database>(input.drizzle);
    const casing = getDrizzleCasing(input.drizzle);
    const withSchema = (tables: Record<string, unknown>) =>
      asDbInstance(drizzleBetterSqlite3(client, { schema: tables, casing, logger: chaiDrizzleLogger }));
    return { ...schemas, drizzle: withSchema(activeSchema), dialect: "sqlite", withSchema };
  }

  if ("drizzle" in input) {
    return { ...schemas, drizzle: asDbInstance(input.drizzle), dialect: "sqlite" };
  }

  const sqlite = new Database(input.file);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzleBetterSqlite3(sqlite, { schema: activeSchema, logger: chaiDrizzleLogger });

  return {
    ...schemas,
    drizzle: asDbInstance(db),
    dialect: "sqlite",
    withSchema: (mergedSchema) =>
      asDbInstance(drizzleBetterSqlite3(sqlite, { schema: mergedSchema, logger: chaiDrizzleLogger })),
    teardown: () => {
      sqlite.close();
    },
  };
}

export type { BetterSQLite3Database };

export type { ChaiTableMapping } from "~/db/table-mapping";
