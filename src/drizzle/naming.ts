/**
 * Configurable SQL names for the ChaiBuilder tables and their relationship columns.
 *
 * Every table in this package is declared through a factory that asks a resolved naming
 * for its SQL table name and for the SQL name of each relationship column. The defaults
 * are the names the package has always used, so a host that configures nothing gets a
 * byte-identical schema. A host that already owns an `apps` table, or that calls the
 * concept a "website", overrides the names it wants:
 *
 * ```ts
 * const built = createChaiPgSchema({ tables: { apps: "websites", appPages: "website_pages" }, columns: { app: "website_id" } });
 * ```
 *
 * The naming lives in code only. The host builds its tables once through the factories
 * (`<pkg>/db/schema-factory`) and hands the same objects to the DB adapter (`tables`),
 * drizzle-kit (top-level exports of its schema file) and the Payload schema hook. The
 * schema modules (`<pkg>/db/schema`, …) always carry the default names.
 *
 * Only SQL identifiers change. The JavaScript keys (`schema.appPages.app`) stay the same,
 * so query code, row shapes and the public API are untouched. Constraint, index and
 * sequence names follow a *table* rename (so two renamed installs never collide) and never
 * a column rename.
 */

/** JS keys of the relationship columns a host may rename; every table that has the key is affected. */
export const CHAI_RELATION_COLUMN_KEYS = ["app", "client", "library", "parent", "pageId", "clientId", "user"] as const;

export type ChaiRelationColumnKey = (typeof CHAI_RELATION_COLUMN_KEYS)[number];

export type ChaiDbColumnNames = Partial<Record<ChaiRelationColumnKey, string>>;

/** Per-table override: a bare SQL name, or a name plus column names for that table only. */
export type ChaiDbTableNaming = string | { name?: string; columns?: ChaiDbColumnNames };

export type ChaiDbNaming = {
  /** Prepended to every table's default name (`"chai_"` → `chai_apps`); a `tables` entry wins over it. */
  tablePrefix?: string;
  /** Keyed by the table's JS export name (`apps`, `appPages`, `appTrash`, …). */
  tables?: Record<string, ChaiDbTableNaming>;
  /** Global relationship-column names by JS key; `tables.<key>.columns` wins over it. */
  columns?: ChaiDbColumnNames;
};

/** The default SQL names of the core tables, keyed by JS export name. */
export const CORE_TABLE_NAMES = {
  apps: "apps",
  appsOnline: "apps_online",
  libraries: "libraries",
  clients: "clients",
  appUsers: "app_users",
  appPages: "app_pages",
  appAssets: "app_assets",
  libraryTemplates: "library_templates",
  appPagesOnline: "app_pages_online",
  libraryItems: "library_items",
  aiLogs: "ai_logs",
} as const;

/**
 * Naming resolved against one set of default table names (a schema factory's own tables).
 *
 * `table` and `column` are typed to return the *default* literal while the runtime value
 * may be a host override. That keeps `typeof apps["_"]["name"]` literal, which drizzle's
 * relational query typing needs to pair relations with tables; nothing at runtime reads
 * the type.
 */
export type ResolvedChaiDbNaming<D extends Record<string, string>> = {
  readonly input: ChaiDbNaming;
  readonly defaults: D;
  /** SQL name for the table exported as `key`. */
  table<K extends keyof D & string>(key: K): D[K];
  /**
   * SQL name for a relationship column, or `""` when it is not renamed. drizzle reads `""`
   * as "no explicit name", so untouched columns keep `keyAsName` and still honour a host's
   * drizzle `casing`.
   */
  column(tableKey: keyof D & string, columnKey: ChaiRelationColumnKey): "";
  /**
   * A constraint, index or sequence name: `legacy` while the table keeps its default name,
   * else `derive(customTableName)`.
   */
  ident(tableKey: keyof D & string, legacy: string, derive: (tableName: string) => string): string;
};

function tableEntry(input: ChaiDbNaming, key: string): { name?: string; columns?: ChaiDbColumnNames } {
  const entry = input.tables?.[key];
  if (entry === undefined) return {};
  return typeof entry === "string" ? { name: entry } : entry;
}

export function resolveChaiDbNaming<D extends Record<string, string>>(
  input: ChaiDbNaming | undefined,
  defaults: D,
): ResolvedChaiDbNaming<D> {
  const naming = input ?? {};
  const table = <K extends keyof D & string>(key: K): D[K] => {
    const fallback = defaults[key];
    if (fallback === undefined) {
      throw new Error(`ChaiBuilder: unknown table key "${key}" in schema factory.`);
    }
    const explicit = tableEntry(naming, key).name;
    if (explicit) return explicit as D[K];
    return (naming.tablePrefix ? `${naming.tablePrefix}${fallback}` : fallback) as D[K];
  };
  return {
    input: naming,
    defaults,
    table,
    column: (tableKey, columnKey) => {
      const perTable = tableEntry(naming, tableKey).columns?.[columnKey];
      const name = perTable ?? naming.columns?.[columnKey] ?? "";
      return (name === columnKey ? "" : name) as "";
    },
    ident: (tableKey, legacy, derive) => {
      const name = table(tableKey);
      return name === defaults[tableKey] ? legacy : derive(name);
    },
  };
}

/**
 * Warns once per unknown `tables` key so a typo (`appPage`) does not silently leave a
 * table at its default name. Called by the union factories, which know every table key.
 */
export function warnUnknownChaiTableKeys(naming: ChaiDbNaming | undefined, knownKeys: Iterable<string>): string[] {
  const known = new Set(knownKeys);
  const unknown = Object.keys(naming?.tables ?? {}).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    console.warn(
      `ChaiBuilder: the table naming names tables that do not exist: ${unknown.join(", ")}. ` +
        `Known keys: ${[...known].join(", ")}.`,
    );
  }
  return unknown;
}
