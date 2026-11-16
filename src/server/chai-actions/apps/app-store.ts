import { eq } from "drizzle-orm";
import { type DbResult, db, safeQuery, schema } from "~/server/chai-actions/db";

/**
 * The one entry point for an app row keyed by id: every core read or write of `apps` /
 * `apps_online` by app id goes through here.
 *
 * Reads return the `safeQuery` shape so each caller keeps its own error codes.
 */

type AppRow = Record<string, any>;
/** `draft` defaults to true (`apps`); false reads `apps_online`. */
type ReadOpts = { draft?: boolean };

/** The full row. `data: null` = not found. */
export async function getAppRow(appId: string, { draft = true }: ReadOpts = {}): Promise<DbResult<AppRow | null>> {
  const table = draft ? schema.apps : schema.appsOnline;
  const query = draft ? db.query.apps : db.query.appsOnline;
  const result = await safeQuery(() => query.findFirst({ where: eq(table.id, appId) }));
  return result.error ? result : { data: (result.data as AppRow | undefined) ?? null, error: null };
}

/** Only the named columns. `data: null` = not found. */
export async function getAppFields(
  appId: string,
  keys: readonly string[],
  { draft = true }: ReadOpts = {},
): Promise<DbResult<AppRow | null>> {
  const table = draft ? schema.apps : schema.appsOnline;
  const query = draft ? db.query.apps : db.query.appsOnline;
  const columns = Object.fromEntries(keys.map((key) => [key, true]));
  const result = await safeQuery(() => query.findFirst({ where: eq(table.id, appId), columns }));
  return result.error ? result : { data: (result.data as AppRow | undefined) ?? null, error: null };
}

/** Updates the draft row. */
export async function updateAppFields(appId: string, patch: AppRow): Promise<DbResult<unknown>> {
  return safeQuery(() => db.update(schema.apps).set(patch).where(eq(schema.apps.id, appId)));
}
