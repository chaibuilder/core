import { getTableColumns, type Table } from "drizzle-orm";

/** Where drizzle keeps a table's column record (`Table.Symbol.Columns`, not in its public types). */
const DRIZZLE_COLUMNS = Symbol.for("drizzle:Columns");

/**
 * `table` as a host app declares it after adding its own columns: the same SQL table with every
 * column Pro declares plus `extra` (column builders, e.g. `{ hostNote: text("host_note") }`).
 * Built the way `rekeyChaiTable` builds its view, so the original table is left untouched. The
 * physical columns still have to be added to the database (`ALTER TABLE … ADD COLUMN`).
 */
export function withHostColumns<T extends Table>(table: T, extra: Record<string, unknown>): T {
  const view = Object.create(Object.getPrototypeOf(table), Object.getOwnPropertyDescriptors(table)) as T;
  const columns: Record<string, unknown> = { ...getTableColumns(table) };
  for (const [key, builder] of Object.entries(extra)) {
    columns[key] = (builder as { build: (table: Table) => unknown }).build(view);
  }
  Object.assign(view, columns);
  (view as unknown as Record<symbol, unknown>)[DRIZZLE_COLUMNS] = columns;
  return view;
}
