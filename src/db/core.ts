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

type ChaiDbSingletonState = {
  db: ChaiDbInstance | null;
  activeSchema: Record<string, unknown> | null;
  dialect: ChaiDbDialect;
  teardown: (() => void) | null;
  tornDown: WeakSet<ChaiDbInstance>;
};

// Kept on `globalThis` like `site-domains.ts`, `state.ts`, and `action-hooks.ts`:
// Next.js / Turbopack builds separate server module graphs per route chunk, so a
// plugin resolver registered on `globalThis` (e.g. `appDomainsResolver`) must see
// the same live DB singleton registered by whichever chunk handles the request.
const _g = globalThis as typeof globalThis & { __chaiDbState?: ChaiDbSingletonState };

function getState(): ChaiDbSingletonState {
  return (_g.__chaiDbState ??= {
    db: null,
    activeSchema: null,
    dialect: "pg",
    teardown: null,
    tornDown: new WeakSet(),
  });
}

function teardownSingletonDb(): void {
  const state = getState();
  if (state.teardown) {
    if (state.db) state.tornDown.add(state.db);
    state.teardown();
  }
  state.db = null;
  state.activeSchema = null;
  state.dialect = "pg";
  state.teardown = null;
}

/** Registers the ChaiBuilder DB singleton from `buildChaiBuilderConfig({ db })`. */
export function registerChaiDb(setup: ChaiDbSetup): void {
  if (!setup?.drizzle) {
    throw new Error("ChaiBuilder: invalid `db` setup. Pass `db: createPostgresDB(...)` (or libsql/d1/better-sqlite3).");
  }

  const state = getState();

  if (state.db !== null && state.db === setup.drizzle) {
    state.activeSchema = setup.schema;
    state.dialect = setup.dialect ?? "pg";
    state.teardown = setup.teardown ?? null;
    return;
  }

  // A stale route chunk can invoke `createCore(config)` after another chunk already
  // replaced and tore down its pool. Keep the live DB instead of resurrecting a closed pool.
  if (state.db !== null && state.tornDown.has(setup.drizzle)) {
    return;
  }

  teardownSingletonDb();
  state.db = setup.drizzle;
  state.activeSchema = setup.schema;
  state.dialect = setup.dialect ?? "pg";
  state.teardown = setup.teardown ?? null;
}

export function getChaiDbDialect(): ChaiDbDialect {
  return getState().dialect;
}

/** Drops the singleton and runs teardown when ChaiBuilder opened the connection. */
export function resetChaiDbForTests(): void {
  teardownSingletonDb();
}

/** Ensures the database singleton is registered (sync — no lazy init). */
export async function ensureChaiDbReady(): Promise<void> {
  if (!getState().db) {
    throw new Error(
      "ChaiBuilder database was not initialized. Pass `db` to `buildChaiBuilderConfig` " +
        "(`db: createPostgresDB(...)`, `createLibsqlDB(...)`, etc.).",
    );
  }
}

/** Chai Drizzle singleton; configured only through `buildChaiBuilderConfig({ db: … })`. */
export function getChaiDb(): ChaiDbInstance {
  const current = getState().db;
  if (!current) {
    throw new Error(
      "ChaiBuilder database was not initialized. Pass `db` to `buildChaiBuilderConfig` " +
        "(`db: createPostgresDB(...)`, `createLibsqlDB(...)`, etc.).",
    );
  }
  return current;
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
    const active = getState().activeSchema || coreSchema;
    return (active as any)[prop];
  },
}) as ChaiCoreSchema;
