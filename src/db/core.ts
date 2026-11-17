import type { PgDatabase } from "drizzle-orm/pg-core";
import * as coreSchema from "~/drizzle/schema.sqlite";
import type { ChaiCoreSchema } from "~/db/schema-shape";
import type { ChaiTableMapping } from "~/db/table-mapping";

/**
 * Loosely-typed relational query surface. Promise-returning signatures (rather
 * than plain `any`) keep generic inference working at call sites like
 * `safeQuery(() => db.query.appPages.findFirst(...))`.
 */
type LooseRelationalQueryBuilder = {
  findFirst: (config?: any) => Promise<any>;
  findMany: (config?: any) => Promise<any[]>;
};

/**
 * All drizzle instances (pg and sqlite family alike) are erased to this shared
 * type at config boundaries — query code is written once and runs on the
 * registered dialect's table objects. `query` is loosened by hand: with the
 * schema generic erased, drizzle's own relational-query typing degenerates,
 * and the actual shape depends on the registered schema (including plugin
 * tables) anyway.
 */
export type ChaiDbInstance = Omit<PgDatabase<any, any>, "query"> & {
  query: Record<string, LooseRelationalQueryBuilder>;
};

/** SQLite/D1/libsql drizzle instances are erased to the shared DbInstance at config boundaries. */
export function asDbInstance<T>(drizzle: T): ChaiDbInstance {
  return drizzle as unknown as ChaiDbInstance;
}

export type ChaiDbDialect = "pg" | "sqlite";

export type ChaiDbSetup = {
  drizzle: ChaiDbInstance;
  schema: Record<string, unknown>;
  /**
   * Default table objects used to rebind plugin relations to host tables. A `schema` entry that is
   * not its default here counts as host-supplied and wins over plugin schema fragments.
   */
  schemaDefaults?: Record<string, unknown>;
  /** The adapter's `tableMapping`, checked against core and plugin table keys at config build. */
  tableMapping?: ChaiTableMapping;
  dialect?: ChaiDbDialect;
  teardown?: () => void;
  /**
   * Rebuilds the drizzle instance over the same connection with a different
   * schema. Set by adapters that own their client; used when plugins merge
   * extra tables so `db.query.<pluginTable>` works too.
   */
  withSchema?: (schema: Record<string, unknown>) => ChaiDbInstance;
};

let _db: ChaiDbInstance | null = null;
let _activeSchema: Record<string, unknown> | null = null;
let _dialect: ChaiDbDialect = "pg";
let _teardown: (() => void) | null = null;

function teardownSingletonDb(): void {
  if (_teardown) {
    _teardown();
  }
  _db = null;
  _activeSchema = null;
  _dialect = "pg";
  _teardown = null;
}

/** Registers the ChaiBuilder DB singleton from `buildChaiBuilderConfig({ db })`. */
export function registerChaiDb(setup: ChaiDbSetup): void {
  if (!setup?.drizzle) {
    throw new Error("ChaiBuilder: invalid `db` setup. Pass `db: createPostgresDB(...)` (or libsql/d1/better-sqlite3).");
  }

  if (_db !== null && _db === setup.drizzle) {
    _activeSchema = setup.schema;
    _dialect = setup.dialect ?? "pg";
    _teardown = setup.teardown ?? null;
    return;
  }

  teardownSingletonDb();
  _db = setup.drizzle;
  _activeSchema = setup.schema;
  _dialect = setup.dialect ?? "pg";
  _teardown = setup.teardown ?? null;
}

export function getChaiDbDialect(): ChaiDbDialect {
  return _dialect;
}

/** Drops the singleton and runs teardown when ChaiBuilder opened the connection. */
export function resetChaiDbForTests(): void {
  teardownSingletonDb();
}

/** Ensures the database singleton is registered (sync — no lazy init). */
export async function ensureChaiDbReady(): Promise<void> {
  if (!_db) {
    throw new Error(
      "ChaiBuilder database was not initialized. Pass `db` to `buildChaiBuilderConfig` " +
        "(`db: createPostgresDB(...)`, `createLibsqlDB(...)`, etc.).",
    );
  }
}

/** Chai Drizzle singleton; configured only through `buildChaiBuilderConfig({ db: … })`. */
export function getChaiDb(): ChaiDbInstance {
  if (!_db) {
    throw new Error(
      "ChaiBuilder database was not initialized. Pass `db` to `buildChaiBuilderConfig` " +
        "(`db: createPostgresDB(...)`, `createLibsqlDB(...)`, etc.).",
    );
  }
  return _db;
}

export const db: ChaiDbInstance = new Proxy({} as ChaiDbInstance, {
  get(_, prop) {
    return (getChaiDb() as any)[prop];
  },
});

export type ChaiDbContext = {
  db: ChaiDbInstance;
  schema: ChaiCoreSchema;
};

export type ChaiDbResult<T> = { data: T; error: null } | { data: null; error: Error };

export async function safeQuery<T>(queryFn: () => Promise<T>): Promise<ChaiDbResult<T>> {
  try {
    const data = await queryFn();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export const schema = new Proxy({} as ChaiCoreSchema, {
  get(_, prop) {
    // Fallback covers code paths that touch tables before registerDb (scripts,
    // unit tests); a registered setup always wins, whatever its dialect.
    const active = _activeSchema || coreSchema;
    return (active as any)[prop];
  },
}) as ChaiCoreSchema;
