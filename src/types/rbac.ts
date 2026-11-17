/** Grant map used for per-user permission overrides (`appUsers.permissions`). */
export type ChaiRoleGrantMap = Record<string, boolean>;

/** Shape of a single role entry resolved from the `roles` table. */
export type ChaiRoleGrant = { permissions?: string[] | null };

/** Role -> entry map assembled from the `roles` table for a client. */
export type ChaiRolesAndPermissions = Record<string, ChaiRoleGrant | null | undefined>;

/**
 * Per-user override stored in `appUsers.permissions`.
 * - Map form `{ "pages:delete": false }` overlays the role grant (true grants, false revokes).
 * - Array form `["pages:create"]` is treated as additive grants (legacy/simple).
 */
export type ChaiUserPermissionOverride = ChaiRoleGrantMap | string[] | null | undefined;
