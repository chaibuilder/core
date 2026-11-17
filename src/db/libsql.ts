import { getDrizzleCasing, getMappedDrizzleClient, mapChaiTables, type ChaiTableMapping } from "~/db/table-mapping";
import { drizzle as drizzleLibSql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient, type Client as LibsqlClient } from "@libsql/client";
import * as schema from "~/drizzle/schema.sqlite";
import { asDbInstance, type ChaiDbSetup } from "~/db/core";
import { chaiDrizzleLogger } from "~/db/logger";

/**
 * `tables` is the drizzle schema record to run on (tables and, optionally, relations); defaults
 * to the core tables under the default naming. Pass `createChaiSqliteSchema(naming).schema` for a
 * programmatic naming. `schema` is the older spelling of the same option.
 */
export type CreateLibsqlDbOptions =
  | {
      url: string;
      authToken?: string;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    }
  | {
      drizzle: LibSQLDatabase<any>;
      tableMapping?: ChaiTableMapping;
      tables?: Record<string, unknown>;
      schema?: Record<string, unknown>;
    };

export function createLibsqlInstance(
  url: string,
  authToken?: string,
): { db: LibSQLDatabase<typeof schema>; client: LibsqlClient } {
  const client = createClient({ url, authToken });
  const db = drizzleLibSql(client, { schema, logger: chaiDrizzleLogger });
  return { db, client };
}

function assertSingleLibsqlInput(input: CreateLibsqlDbOptions): void {
  const count = Number("url" in input) + Number("drizzle" in input);
  if (count !== 1) {
    throw new Error("ChaiBuilder: createLibsqlDB expects exactly one of `url` or `drizzle`.");
  }
}

/** Creates a libSQL Drizzle setup for `buildChaiBuilderConfig({ db: ... })`. */
export function createLibsqlDb(input: CreateLibsqlDbOptions): ChaiDbSetup {
  assertSingleLibsqlInput(input);

  const activeSchema = mapChaiTables(input.tables ?? input.schema ?? schema, input.tableMapping, schema);
  const schemas = { schema: activeSchema, schemaDefaults: schema, tableMapping: input.tableMapping };

  if ("drizzle" in input && input.tableMapping && Object.keys(input.tableMapping).length > 0) {
    const client = getMappedDrizzleClient<LibsqlClient>(input.drizzle);
    const casing = getDrizzleCasing(input.drizzle);
    const withSchema = (tables: Record<string, unknown>) =>
      asDbInstance(drizzleLibSql(client, { schema: tables, casing, logger: chaiDrizzleLogger }));
    return { ...schemas, drizzle: withSchema(activeSchema), dialect: "sqlite", withSchema };
  }

  if ("drizzle" in input) {
    return { ...schemas, drizzle: asDbInstance(input.drizzle), dialect: "sqlite" };
  }

  const client = createClient({ url: input.url, authToken: input.authToken });
  const db = drizzleLibSql(client, { schema: activeSchema, logger: chaiDrizzleLogger });
  return {
    ...schemas,
    drizzle: asDbInstance(db),
    dialect: "sqlite",
    withSchema: (mergedSchema) =>
      asDbInstance(drizzleLibSql(client, { schema: mergedSchema, logger: chaiDrizzleLogger })),
    teardown: () => {
      client.close();
    },
  };
}

export type { LibsqlClient, LibSQLDatabase };

export type { ChaiTableMapping } from "~/db/table-mapping";

// Deprecated names, kept for compatibility. See ./libsql.deprecated.ts.
export * from "./libsql.deprecated";
