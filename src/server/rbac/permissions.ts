/**
 * RBAC permission catalog + matching helpers.
 *
 * Permission keys use the `entity:operation` format (e.g. `pages:create`).
 * Wildcards are supported in grant maps and grant lists:
 *   - `*`         -> all permissions
 *   - `pages:*`   -> all operations within an entity
 *
 * The catalog itself lives in ~/constants/PERMISSIONS — this file adds the
 * wildcard-aware helper functions used by the server-side RBAC engine.
 */

export { CHAI_PERMISSIONS, type ChaiPermission } from "~/constants/PERMISSIONS";
import { CHAI_PERMISSIONS, legacyAliasesOf } from "~/constants/PERMISSIONS";

/** Built-in catalog of all core permission keys. */
export const CHAI_PERMISSION_LIST: string[] = Object.keys(CHAI_PERMISSIONS);

const WILDCARD_ALL = "*";

function entityOf(permission: string): string {
  const idx = permission.indexOf(":");
  return idx === -1 ? permission : permission.slice(0, idx);
}

/**
 * Checks whether a granted permission set satisfies a required permission.
 * Wildcard-aware: `*` matches everything, `entity:*` matches any op in the entity.
 * A retired key a stored role still grants satisfies its replacement (`LEGACY_PERMISSION_ALIASES`).
 */
export function hasPermission(granted: string[] | null | undefined, required: string): boolean {
  if (!required) return true;
  if (!granted || granted.length === 0) return false;
  if (granted.includes(WILDCARD_ALL)) return true;
  if (granted.includes(required)) return true;
  if (granted.includes(`${entityOf(required)}:*`)) return true;
  return legacyAliasesOf(required).some((legacy) => hasPermission(granted, legacy));
}

/**
 * Expands a grant map (`{ "*": true, "pages:delete": false }`) into a concrete,
 * catalog-bounded list of granted permission keys. `false` entries revoke a key
 * that an earlier wildcard granted.
 */
export function expandGrantMap(
  map: Record<string, boolean> | null | undefined,
  catalog: string[] = CHAI_PERMISSION_LIST,
): string[] {
  if (!map) return [];

  const granted = new Set<string>();

  // First pass: apply grants (true), expanding wildcards against the catalog.
  for (const [key, allowed] of Object.entries(map)) {
    if (allowed !== true) continue;
    if (key === WILDCARD_ALL) {
      catalog.forEach((perm) => granted.add(perm));
    } else if (key.endsWith(":*")) {
      const entity = key.slice(0, -2);
      catalog.filter((perm) => entityOf(perm) === entity).forEach((perm) => granted.add(perm));
    } else {
      granted.add(key);
    }
  }

  // Second pass: apply revokes (false) — revoke wins over any wildcard grant.
  for (const [key, allowed] of Object.entries(map)) {
    if (allowed !== false) continue;
    if (key === WILDCARD_ALL) {
      granted.clear();
    } else if (key.endsWith(":*")) {
      const entity = key.slice(0, -2);
      [...granted].filter((perm) => entityOf(perm) === entity).forEach((perm) => granted.delete(perm));
    } else {
      granted.delete(key);
    }
  }

  return [...granted];
}

/**
 * Intersects two permission representations into a concrete, catalog-bounded list.
 * Each side may contain concrete keys or wildcards (`*`, `entity:*`). Used to
 * compute the effective permission set for MCP requests:
 *   effective = userPermissions ∩ delegatedScopes
 */
export function intersectPermissions(a: string[], b: string[], catalog: string[] = CHAI_PERMISSION_LIST): string[] {
  const expand = (list: string[]): Set<string> => {
    const out = new Set<string>();
    for (const key of list) {
      if (key === WILDCARD_ALL) {
        catalog.forEach((perm) => out.add(perm));
      } else if (key.endsWith(":*")) {
        const entity = key.slice(0, -2);
        catalog.filter((perm) => entityOf(perm) === entity).forEach((perm) => out.add(perm));
      } else {
        out.add(key);
      }
    }
    return out;
  };

  const setA = expand(a);
  const setB = expand(b);
  return [...setA].filter((perm) => setB.has(perm));
}
