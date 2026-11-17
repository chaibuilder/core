import { CHAI_PERMISSION_LIST, expandChaiGrantMap } from "./permissions";
import type { ChaiRoleGrantMap, ChaiRolesAndPermissions, ChaiUserPermissionOverride } from "~/types/rbac";

export type {
  ChaiRoleGrantMap,
  ChaiRoleGrant,
  ChaiRolesAndPermissions,
  ChaiUserPermissionOverride,
} from "~/types/rbac";

export type ResolvePermissionsArgs = {
  role: string;
  roleMap: ChaiRolesAndPermissions | null | undefined;
  userOverride?: ChaiUserPermissionOverride;
  catalog?: string[];
};

function overrideToGrantMap(override: ChaiUserPermissionOverride): ChaiRoleGrantMap | null {
  if (!override) return null;
  if (Array.isArray(override)) {
    return override.reduce<ChaiRoleGrantMap>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  }
  return override;
}

/**
 * Resolves a user's effective permissions to a flat, catalog-bounded list.
 *
 * Resolution order:
 *   1. base   = role grant from `roleMap[role].permissions` (wildcards expanded)
 *   2. overlay = per-user override (true grants, false revokes; revoke wins)
 */
/** Expands a `string[]` of grants (including wildcards) to concrete catalog keys. */
function expandPermissionList(list: string[], catalog: string[]): string[] {
  const out = new Set<string>();
  for (const key of list) {
    if (key === "*") {
      catalog.forEach((p) => out.add(p));
    } else if (key.endsWith(":*")) {
      const entity = key.slice(0, -2);
      catalog.filter((p) => p.startsWith(`${entity}:`)).forEach((p) => out.add(p));
    } else {
      out.add(key);
    }
  }
  return [...out];
}

export function resolveChaiPermissions({
  role,
  roleMap,
  userOverride,
  catalog = CHAI_PERMISSION_LIST,
}: ResolvePermissionsArgs): string[] {
  const roleGrant = roleMap?.[role]?.permissions ?? [];
  const granted = new Set<string>(expandPermissionList(roleGrant, catalog));

  const overrideMap = overrideToGrantMap(userOverride);
  if (overrideMap) {
    for (const [key, allowed] of Object.entries(overrideMap)) {
      if (allowed === true) {
        // Re-expand the single key (supports `entity:*`).
        expandChaiGrantMap({ [key]: true }, catalog).forEach((perm) => granted.add(perm));
      } else if (allowed === false) {
        expandChaiGrantMap({ [key]: true }, catalog).forEach((perm) => granted.delete(perm));
      }
    }
  }

  return [...granted];
}
