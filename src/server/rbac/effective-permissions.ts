import { getChaiPermissionCatalog } from "~/server/rbac/permission-catalog";
import { intersectChaiPermissions } from "~/server/rbac/permissions";

/** Concrete (non-wildcard) permission keys — the only ones an intersection can match on. */
function concreteKeys(list: string[]): string[] {
  return list.filter((key) => key !== "*" && !key.endsWith(":*"));
}

/**
 * `intersectChaiPermissions` expands wildcards against a catalog, so anything outside that catalog
 * (host-defined keys) would silently vanish from `["*"] ∩ [...]`. Base is the runtime catalog
 * (built-ins + plugin-registered keys), widened further with the concrete keys named by
 * either side so host keys never registered anywhere stay intersectable.
 */
export function delegationCatalog(granted: string[], delegated: string[]): string[] {
  return [...new Set([...getChaiPermissionCatalog(), ...concreteKeys(granted), ...concreteKeys(delegated)])];
}

/**
 * Applies the delegation ceiling: a credential can never exceed the permissions delegated to it,
 * however permissive the user behind it is. No ceiling set (`null`) means no clamp.
 *
 * Shared by the action dispatcher and the MCP transport so both compute the same effective set —
 * a tool the MCP surface lists is exactly a tool whose actions will not 403 on a permission the
 * ceiling removed.
 */
export function resolveEffectivePermissions(granted: string[] | null, delegated: string[] | null): string[] {
  const permissions = granted ?? [];
  if (delegated === null) return permissions;
  return intersectChaiPermissions(permissions, delegated, delegationCatalog(permissions, delegated));
}

/** Intersects two optional ceilings. `null` on either side means "no ceiling from that side". */
export function mergeDelegationCeilings(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): string[] | null {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a;
  return intersectChaiPermissions(a, b, delegationCatalog(a, b));
}
