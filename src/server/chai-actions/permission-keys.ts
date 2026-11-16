import type { ChaiActionContext, ChaiPermissionResolver, ChaiRequiredPermission } from "~/types/chai-action";

/**
 * Tags a payload-aware permission resolver with every key it may ever return, so
 * static audits (MCP tool-permission superset, role-reach test, docs) that cannot
 * call the resolver can still see what it may demand. `wp` / `withActionPermission`
 * refuse an untagged function — use this instead of assigning the property by hand.
 */
export function permissionResolver<T = any>(
  declaredPermissionKeys: string[],
  resolve: (data: T, context: ChaiActionContext) => string | string[] | null | undefined,
): ChaiPermissionResolver<T> {
  const resolver = resolve as ChaiPermissionResolver<T>;
  resolver.declaredPermissionKeys = [...declaredPermissionKeys];
  return resolver;
}

/**
 * Every permission key `permission` may require, for any payload, without running
 * it — the superset, not the requirement for a given call. An ungated action
 * returns `[]`.
 */
export function declaredPermissionKeysOf(permission: ChaiRequiredPermission | undefined | null): string[] {
  if (!permission) return [];
  if (typeof permission === "string") return [permission];
  if (Array.isArray(permission)) return permission.filter(Boolean);
  const declared = permission.declaredPermissionKeys;
  if (!declared) {
    throw new Error(
      "A function-form requiredPermission must declare the keys it may require. " +
        "Wrap it with permissionResolver([...keys], fn) from " +
        "~/server/chai-actions/permission-keys so the static permission guards can see it.",
    );
  }
  return [...declared];
}
