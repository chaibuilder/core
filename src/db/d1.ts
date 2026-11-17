import { getDrizzleCasing, getMappedDrizzleClient, mapChaiTables, type ChaiTableMapping } from "~/db/table-mapping";
import { drizzle as drizzleD1, type AnyD1Database, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "~/drizzle/schema.sqlite";
import { asDbInstance, type ChaiDbSetup } from "~/db/core";
import { chaiDrizzleLogger } from "~/db/logger";

/**
 * `tables` is the drizzle schema record to run on (tables and, optionally, relations); defaults
 * to the core tables under the default naming. Pass `createChaiSqliteSchema(naming).schema` for a
 * programmatic naming. `schema` is the older spelling of the same option.
 */
export type CreateD1DbOptions =
  | {
      d1: AnyD1Database;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    }
  | {
      drizzle: DrizzleD1Database<any>;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    };

export function createD1Instance(d1: AnyD1Database): DrizzleD1Database<typeof schema> {
  return drizzleD1(d1, { schema, logger: chaiDrizzleLogger });
}

function assertSingleD1Input(input: CreateD1DbOptions): void {
  const count = Number("d1" in input) + Number("drizzle" in input);
  if (count !== 1) {
    throw new Error("ChaiBuilder: createD1DB expects exactly one of `d1` or `drizzle`.");
  }
}

/** Creates a Cloudflare D1 Drizzle setup for `buildChaiBuilderConfig({ db: ... })`. */
export function createD1Db(input: CreateD1DbOptions): ChaiDbSetup {
  assertSingleD1Input(input);

  const activeSchema = mapChaiTables(input.tables ?? input.schema ?? schema, input.tableMapping, schema);
  const schemas = { schema: activeSchema, schemaDefaults: schema, tableMapping: input.tableMapping };

  if ("drizzle" in input && input.tableMapping && Object.keys(input.tableMapping).length > 0) {
    const client = getMappedDrizzleClient<AnyD1Database>(input.drizzle);
    const casing = getDrizzleCasing(input.drizzle);
    const withSchema = (tables: Record<string, unknown>) =>
      asDbInstance(drizzleD1(client, { schema: tables, casing, logger: chaiDrizzleLogger }));
    return { ...schemas, drizzle: withSchema(activeSchema), dialect: "sqlite", withSchema };
  }

  if ("drizzle" in input) {
    return { ...schemas, drizzle: asDbInstance(input.drizzle), dialect: "sqlite" };
  }

  return {
    ...schemas,
    drizzle: asDbInstance(drizzleD1(input.d1, { schema: activeSchema, logger: chaiDrizzleLogger })),
    dialect: "sqlite",
    withSchema: (mergedSchema) =>
      asDbInstance(drizzleD1(input.d1, { schema: mergedSchema, logger: chaiDrizzleLogger })),
  };
}

export type { DrizzleD1Database };

export type { ChaiTableMapping } from "~/db/table-mapping";

// Deprecated names, kept for compatibility. See ./d1.deprecated.ts.
export * from "./d1.deprecated";
