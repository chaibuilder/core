import type { ChaiRolesAndPermissions } from "./resolve-permissions";

/**
 * Built-in fallback role maps used when the `roles` table has no rows.
 * Prevents lockout on fresh installs / before any role has been configured.
 *
 * Once ANY role row exists in the DB, these defaults are NOT applied —
 * the DB is the single source of truth.
 *
 * Contains BASE (core) permission keys only. Plugin-owned grants (redirects,
 * trash, revisions, …) are contributed by their plugins via the
 * `defaultRoleGrants` config key and overlaid onto this map whenever it is
 * used as the fallback — see `applyDefaultRoleGrants` in get-role-permissions.
 *
 * ## Wildcard guidelines
 *
 * `"*"` (grant-all)
 *   ✅ ONLY for roles that truly own the system: owner, admin, superadmin.
 *   ✅ Automatically covers built-in AND plugin-registered permission keys
 *      (wildcards expand against the runtime catalog).
 *   ❌ NEVER use for scoped roles (editor, designer, viewer, user).
 *
 * `"entity:*"` (entity-level wildcard)
 *   ✅ Safe for scoped roles — grants all current + future ops within that entity.
 *   ⚠️  Review when adding a new operation to an entity (e.g. pages:archive).
 *   ❌ Avoid for sensitive entities: users, domains, settings, theme.
 *
 * Explicit keys (`"pages:read"`)
 *   ✅ Safest — no implicit grants, fully auditable.
 *   ✅ Required for users, domains, settings, theme.
 */
export const DEFAULT_ROLE_MAPS: ChaiRolesAndPermissions = {
  owner: { permissions: ["*"] },
  /** `*` within one tenant — the grant of a per-app `app_users` row. */
  admin: { permissions: ["*"] },
  /**
   * `*` across every tenant. Only ever the role of a global row (`app_users.app IS NULL`);
   * the `app_users_global_is_superadmin` check constraint enforces that pairing, so this
   * is never a per-app grant. As a per-app role it would be indistinguishable from `admin`.
   */
  superadmin: { permissions: ["*"] },

  editor: {
    permissions: ["app:read", "pages:*", "partials:*", "assets:*", "library:*", "ai:*"],
  },

  designer: {
    permissions: [
      "app:read",
      "pages:*",
      "partials:*",
      "assets:*",
      "library:*",
      "theme:edit",
      "theme:publish",
      "design_tokens:read",
      "design_tokens:create",
      "design_tokens:edit",
      "design_tokens:delete",
      "ai:*",
    ],
  },

  viewer: {
    permissions: ["app:read", "pages:read", "partials:read", "assets:read", "library:read"],
  },

  user: {
    permissions: ["app:read", "pages:read"],
  },
};
