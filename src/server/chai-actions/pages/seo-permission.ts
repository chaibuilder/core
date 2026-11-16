import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { permissionResolver } from "~/server/chai-actions/permission-keys";
import type { ChaiPermissionResolver } from "~/types/chai-action";

/**
 * Payload keys that carry a page's search-engine surface: `seo`, the page-level
 * `jsonld` column, and `globalJsonLds` (shared schema ids rendered into `<head>`).
 * Only `seo` is accepted by UPDATE_PAGE today; the other two are listed so a
 * later widening of its schema is gated on arrival, not silently inherited.
 */
export const SEO_PAYLOAD_FIELDS = ["seo", "jsonld", "globalJsonLds"] as const;

/**
 * True when the payload carries any of {@link SEO_PAYLOAD_FIELDS}. Keyed on
 * presence, not on change: a caller that does not intend an SEO write must
 * omit `seo` entirely rather than echo back an unchanged value.
 */
export function touchesSeoFields(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return SEO_PAYLOAD_FIELDS.some((field) => record[field] !== undefined);
}

/**
 * Adds `pages:edit_seo` to `baseline` when the payload touches an SEO field.
 * Enforced on the action itself, not the panel: the HTTP action, the instance
 * API and MCP tools all reach UPDATE_PAGE with nothing but `pages:update` in
 * the way otherwise, so an editor without SEO rights could rewrite a page's
 * title/canonical/noIndex by posting the payload the panel would have refused.
 */
export function seoAwarePermission(
  baseline: string,
  extract: (data: unknown) => unknown = (data) => data,
): ChaiPermissionResolver<unknown> {
  return permissionResolver([baseline, CHAI_PERMISSIONS["pages:edit_seo"]], (data: unknown) =>
    touchesSeoFields(extract(data)) ? [baseline, CHAI_PERMISSIONS["pages:edit_seo"]] : baseline,
  );
}

/**
 * UPDATE_PAGE: `pages:update`, plus `pages:edit_seo` when the payload carries SEO.
 *
 * Deliberately NOT applied to UPDATE_PAGE_METADATA: that writes the
 * `app_pages.metadata` column, a separate column `seo`/`jsonld`/`globalJsonLds`
 * are never read from — an SEO key placed there is inert.
 *
 * Carries `declaredPermissionKeys = ["pages:update", "pages:edit_seo"]` so static
 * audits that only inspect the registration (not the resolver) still see it gated.
 */
export const updatePagePermission = seoAwarePermission(CHAI_PERMISSIONS["pages:update"]);

/** Both keys UPDATE_PAGE can require, for callers that want the list by name. */
export const UPDATE_PAGE_PERMISSION_KEYS: string[] = updatePagePermission.declaredPermissionKeys ?? [];
