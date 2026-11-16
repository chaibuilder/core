import { getTableColumns, is, Relations, Table, type AnyColumn } from "drizzle-orm";

/**
 * Maps one ChaiBuilder table key to the host's schema key: `"websitePages"`, or
 * `{ table: "websitePages", columns: { app: "website" } }` when the host's table also names
 * columns differently (ChaiBuilder's column key → the host's). `null` declares that the host's
 * table has no such column at all, which exempts it from the required-column check; reserve it
 * for columns only optional Pro features read.
 */
export type ChaiTableMappingEntry = string | { table: string; columns?: Record<string, string | null> };

/** Maps ChaiBuilder's table keys to the host's schema keys, e.g. `{ appPages: "websitePages" }`. */
export type ChaiTableMapping = Record<string, ChaiTableMappingEntry>;

/** Where drizzle keeps a table's column record (`Table.Symbol.Columns`, not in its public types). */
const DRIZZLE_COLUMNS = Symbol.for("drizzle:Columns");

/**
 * Copies the host schema under canonical keys without changing its tables or exports. A mapped
 * table is passed through as-is, unless its entry maps columns: then Pro gets a view of it keyed
 * by its own column keys (see `rekeyChaiTable`), and the host keeps its table untouched.
 */
export function mapChaiTables(
  hostSchema: Record<string, unknown>,
  mapping?: ChaiTableMapping,
  defaults: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!mapping || Object.keys(mapping).length === 0) return hostSchema;

  const mapped = { ...hostSchema };
  const aliases = new Set<string>();
  const active = new Map<string, Table>();
  for (const [key, entry] of Object.entries(mapping)) {
    const { table: alias, columns } = typeof entry === "string" ? { table: entry, columns: undefined } : entry;
    if (!alias || !Object.hasOwn(hostSchema, alias) || !is(hostSchema[alias], Table)) {
      throw new Error(
        `ChaiBuilder: tableMapping.${key} must reference a Drizzle table in tables (received "${alias}").`,
      );
    }
    if (aliases.has(alias)) {
      throw new Error(`ChaiBuilder: tableMapping maps multiple tables to "${alias}".`);
    }
    aliases.add(alias);
    const renamed = Object.fromEntries(
      Object.entries(columns ?? {}).filter((entry): entry is [string, string] => entry[1] !== null),
    );
    const table =
      Object.keys(renamed).length > 0 ? rekeyChaiTable(hostSchema[alias], renamed, `tableMapping.${key}`) : hostSchema[alias];
    if (is(defaults[key], Table)) {
      const tableColumns = getTableColumns(table);
      for (const column of Object.keys(getTableColumns(defaults[key]))) {
        if (columns?.[column] === null) continue;
        if (!Object.hasOwn(tableColumns, column)) {
          throw new Error(`ChaiBuilder: mapped table "${alias}" is missing required column key "${column}".`);
        }
      }
    }
    active.set(key, table);
  }
  for (const alias of aliases) delete mapped[alias];
  // An unrelated host table may already occupy a canonical key. The explicit mapping wins
  // only inside Pro; the original host schema and its query registration stay unchanged.
  for (const [key, table] of active) mapped[key] = table;

  // Two schema keys for one table make Drizzle's relational query registration ambiguous.
  const tables = new Set<Table>();
  for (const value of Object.values(mapped)) {
    if (!is(value, Table)) continue;
    if (tables.has(value)) throw new Error("ChaiBuilder: tables registers the same Drizzle table under multiple keys.");
    tables.add(value);
  }
  return mapped;
}

/**
 * The host's table under ChaiBuilder's column keys: the same SQL table and the same column
 * objects, with each mapped column reachable under ChaiBuilder's key instead of the host's.
 * Columns the mapping does not name keep the host's key, so a host-only column still comes back
 * on every row Pro selects. `columns` maps ChaiBuilder's column key → the host's.
 */
export function rekeyChaiTable<T extends Table>(table: T, columns: Record<string, string>, label: string): T {
  const hostColumns = getTableColumns(table);
  const toChaiKey = new Map<string, string>();
  for (const [chaiKey, hostKey] of Object.entries(columns)) {
    if (!Object.hasOwn(hostColumns, hostKey)) {
      throw new Error(`ChaiBuilder: ${label}.columns.${chaiKey} must name a column of the table (received "${hostKey}").`);
    }
    if (chaiKey !== hostKey && Object.hasOwn(hostColumns, chaiKey) && !Object.values(columns).includes(chaiKey)) {
      throw new Error(`ChaiBuilder: ${label}.columns.${chaiKey} collides with the table's own "${chaiKey}" column.`);
    }
    toChaiKey.set(hostKey, chaiKey);
  }
  const rekeyed = Object.fromEntries(
    Object.entries(hostColumns).map(([hostKey, column]) => [toChaiKey.get(hostKey) ?? hostKey, column]),
  );
  // Drizzle keeps a table's columns twice: as own properties (`table.app`) and under its
  // `drizzle:Columns` symbol, which select-all, insert/update mapping and relational queries read.
  const view = Object.create(Object.getPrototypeOf(table), Object.getOwnPropertyDescriptors(table)) as T;
  for (const hostKey of Object.keys(hostColumns)) delete (view as Record<string, unknown>)[hostKey];
  Object.assign(view, rekeyed);
  (view as unknown as Record<symbol, unknown>)[DRIZZLE_COLUMNS] = rekeyed;
  return view;
}

/** Rebuilds relation metadata against the active tables after plugin defaults are merged. */
export function rebindChaiRelations(
  schema: Record<string, unknown>,
  defaults: Record<string, unknown>[],
): Record<string, unknown> {
  const replacements = new Map<Table, Table>();
  for (const source of defaults) {
    for (const [key, value] of Object.entries(source)) {
      if (is(value, Table) && is(schema[key], Table) && value !== schema[key]) replacements.set(value, schema[key]);
    }
  }
  if (replacements.size === 0) return schema;

  const table = (value: Table) => replacements.get(value) ?? value;
  const column = (value: AnyColumn): AnyColumn => {
    const replacement = replacements.get(value.table);
    if (!replacement) return value;
    const key = Object.entries(getTableColumns(value.table)).find(([, entry]) => entry === value)?.[0];
    const active = key && getTableColumns(replacement)[key];
    if (!active) throw new Error(`ChaiBuilder: mapped table is missing relation column "${key ?? value.name}".`);
    return active;
  };
  const rebound = { ...schema };
  for (const [key, value] of Object.entries(schema)) {
    if (!is(value, Relations)) continue;
    rebound[key] = new Relations(table(value.table), (helpers) =>
      value.config({
        one: ((target: Table, config?: any) =>
          helpers.one(
            table(target),
            config && {
              ...config,
              fields: config.fields.map(column),
              references: config.references.map(column),
            },
          )) as typeof helpers.one,
        many: ((target: Table, config?: any) => helpers.many(table(target), config)) as typeof helpers.many,
      }),
    );
  }
  return rebound;
}

/**
 * Rejects mapping keys that name no ChaiBuilder table. A typo (`appPage`) would otherwise leave
 * the real key on its default table, or on an unrelated host table that owns that code name.
 */
export function assertChaiTableMappingKeys(mapping: ChaiTableMapping | undefined, knownKeys: Iterable<string>): void {
  const known = new Set(knownKeys);
  const unknown = Object.keys(mapping ?? {}).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `ChaiBuilder: tableMapping names tables that ChaiBuilder does not declare: ${unknown.join(", ")}. ` +
        `Known keys: ${[...known].join(", ")}.`,
    );
  }
}

export type ChaiDrizzleCasing = "snake_case" | "camelCase";

/**
 * The `casing` a caller-owned Drizzle instance was built with, so a registration over its client
 * resolves keyAsName columns the same way. Drizzle keeps only the converter on its dialect, so the
 * casing is read from what it does to a probe key; `undefined` when there is none.
 */
export function getDrizzleCasing(instance: unknown): ChaiDrizzleCasing | undefined {
  const convert = (instance as { dialect?: { casing?: { convert?: unknown } } }).dialect?.casing?.convert;
  if (typeof convert !== "function") return undefined;
  const probe = convert("casing_probeKey");
  if (probe === "casing_probe_key") return "snake_case";
  if (probe === "casingProbeKey") return "camelCase";
  return undefined;
}

/** Mapping a caller-owned Drizzle instance requires a separate registration over its client. */
export function getMappedDrizzleClient<T>(instance: unknown): T {
  const client = (instance as { $client?: T }).$client;
  if (!client || typeof client === "string") {
    throw new Error(
      "ChaiBuilder: tableMapping with drizzle requires an instance exposing $client; pass the client directly instead.",
    );
  }
  return client;
}
