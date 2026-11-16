import { and, eq } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";

/** Page type of a shared JSON-LD schema record (always stored in `app_pages_online`). */
export const GLOBAL_JSONLD_PAGE_TYPE = "_GlobalJSONLD";

/**
 * Metadata flag meaning "attach this shared schema to every new page".
 * `addToNewPages` is the written key; `applyToNewPages` was a read-only alias
 * the edit dialog used, causing its checkbox to always show unchecked — both
 * are tolerated here so the two spellings can never disagree again.
 */
const DEFAULT_FLAG_KEYS = ["addToNewPages", "applyToNewPages"] as const;

export type GlobalJsonLdSchemaRow = {
  id: string;
  primaryPage: string | null;
  metadata: unknown;
};

/** True when a schema row is flagged "enabled by default for new pages". */
function isDefaultForNewPages(row: GlobalJsonLdSchemaRow): boolean {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as Record<string, unknown>;
  return DEFAULT_FLAG_KEYS.some((key) => record[key] === true);
}

/**
 * Ids of the shared schemas a new page should start with, in row order.
 * Pages store *primary* ids — a language variant resolves back to its primary,
 * which `getPageGlobalJSONLds` re-resolves to the right-language row at render
 * time — so a flag set on any language variant promotes the schema onto every
 * new page in every language, not just that language. De-duplicated.
 */
export function pickDefaultGlobalJsonLdIds(rows: GlobalJsonLdSchemaRow[]): string[] {
  const ids = rows.filter(isDefaultForNewPages).map((row) => row.primaryPage ?? row.id);
  return [...new Set(ids)];
}

/**
 * Reads the app's shared JSON-LD schemas and returns the ids flagged default.
 *
 * Filtered in JS rather than in SQL: the flag lives inside a JSON column whose
 * path operators differ between the pg and sqlite dialects the SDK supports, and
 * a site has a handful of these rows at most.
 *
 * Fails open — a query error must not block page creation; the page is simply
 * created without the default schemas (they can still be attached afterwards).
 */
export async function getDefaultGlobalJsonLdIds(appId: string): Promise<string[]> {
  const table = schema.appPagesOnline;
  const { data, error } = await safeQuery(() =>
    db
      .select({ id: table.id, primaryPage: table.primaryPage, metadata: table.metadata })
      .from(table)
      .where(and(eq(table.app, appId), eq(table.pageType, GLOBAL_JSONLD_PAGE_TYPE))),
  );

  if (error) {
    console.error("getDefaultGlobalJsonLdIds: query failed", error);
    return [];
  }

  return pickDefaultGlobalJsonLdIds((data ?? []) as GlobalJsonLdSchemaRow[]);
}
