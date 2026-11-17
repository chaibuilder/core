/**
 * Process-wide registry of plugin-contributed permission keys.
 *
 * Plugins declare the keys they own by calling {@link registerChaiPermissions}
 * from their config reducer. Registration is keyed by owner, so re-running the
 * reducer (rebuilds, HMR) replaces rather than duplicates. The runtime RBAC
 * catalog (`getChaiPermissionCatalog`) is the union of the core catalog and every
 * registered set — there is no app-facing config key for this; the catalog
 * follows the plugins that are actually installed.
 */

const registeredPermissions = new Map<string, string[]>();

/**
 * Declares the permission keys a plugin owns, e.g.
 * `registerChaiPermissions("chai:redirects", REDIRECTS_PERMISSION_LIST)`.
 * Re-registration under the same owner replaces the previous set.
 */
export function registerChaiPermissions(owner: string, keys: string[]): void {
  registeredPermissions.set(owner, [...keys]);
}

/** Union of every registered permission set (deduped). */
export function getContributedChaiPermissions(): string[] {
  return [...new Set([...registeredPermissions.values()].flat())];
}

export function resetChaiPermissionsForTests(): void {
  registeredPermissions.clear();
}
