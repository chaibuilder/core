import { getConfigDefaultRoleGrants, getConfigRoles } from "~/server/defaults/config-registry";
import type { ChaiDefaultRoleGrants } from "~/types/server-config";
import { DEFAULT_ROLE_MAPS } from "./default-roles";
import type { ChaiRolesAndPermissions } from "./resolve-permissions";

/**
 * Overlays plugin-contributed grants onto the built-in default role maps.
 * Fallback-only: never applied to an explicit role map or plugin-loaded roles —
 * those sources own their grants (adopting a plugin there is a config edit or
 * a migration, like 20260715_150000_redirects_permissions).
 */
function applyDefaultRoleGrants(base: ChaiRolesAndPermissions, grants: ChaiDefaultRoleGrants): ChaiRolesAndPermissions {
  const entries = Object.entries(grants);
  if (entries.length === 0) return base;

  const out = { ...base };
  for (const [role, keys] of entries) {
    const existing = out[role]?.permissions;
    if (!existing) continue; // plugins don't invent roles
    if (existing.includes("*")) continue; // grant-all already covers the widened catalog
    out[role] = { permissions: [...new Set([...existing, ...keys])] };
  }
  return out;
}

function defaultsWithGrants(): ChaiRolesAndPermissions {
  return applyDefaultRoleGrants(DEFAULT_ROLE_MAPS, getConfigDefaultRoleGrants());
}

let warnedMissingRolesEngine = false;

/**
 * Resolves the global role -> permission map. Roles are shared across the
 * system — not scoped to any client or app.
 *
 * Core owns only code-defined roles: the built-in {@link DEFAULT_ROLE_MAPS}
 * (with plugin `defaultRoleGrants` overlaid) or a literal map from config.
 * DB-backed customization is a plugin concern — the roles plugin replaces
 * `roles: { source: "custom" }` with a {@link ChaiRolesLoader}; a loader
 * returning `null` ("nothing stored") falls back to the defaults, preventing
 * lockout on fresh installs.
 */
export async function getChaiGlobalRoles(): Promise<ChaiRolesAndPermissions> {
  const configRoles = getConfigRoles();

  if (!configRoles) return defaultsWithGrants();

  // Plugin-installed engine (must be checked before the `in` narrowing below).
  if (typeof configRoles === "function") {
    const loaded = await configRoles();
    return loaded ?? defaultsWithGrants();
  }

  if ("source" in configRoles && configRoles.source === "custom") {
    // The marker survived config resolution — no roles plugin swapped it out.
    if (!warnedMissingRolesEngine) {
      warnedMissingRolesEngine = true;
      console.warn(
        "[chaibuilder] roles: { source: 'custom' } is set but no roles plugin is installed; falling back to built-in default roles.",
      );
    }
    return defaultsWithGrants();
  }

  return configRoles as ChaiRolesAndPermissions;
}
