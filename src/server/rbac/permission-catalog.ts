import { getContributedChaiPermissions } from "~/server/plugin-api/permission-registry";
import { CHAI_PERMISSION_LIST } from "./permissions";

/**
 * The runtime RBAC catalog: built-in keys plus everything plugins registered
 * via `registerChaiPermissions`. Wildcard expansion (`*`, `entity:*`) must run
 * against THIS list, not the static `CHAI_PERMISSION_LIST`, or plugin keys
 * silently vanish from expanded grants.
 *
 * Lives apart from `permissions.ts` so the pure matching helpers stay free of
 * registry dependencies (they are public API).
 */
export function getChaiPermissionCatalog(): string[] {
  return [...new Set([...CHAI_PERMISSION_LIST, ...getContributedChaiPermissions()])];
}
