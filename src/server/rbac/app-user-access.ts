import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getChaiGlobalRoles } from "./get-role-permissions";
import { getChaiPermissionCatalog } from "./permission-catalog";
import { resolveChaiPermissions } from "./resolve-permissions";

export type ChaiAppUserAccess = {
  /** Role name as stored on the membership row. */
  role: string;
  /** Concrete permission keys: the role's grants, with the row's per-user overrides applied. */
  permissions: string[];
};

export type ResolveChaiAppUserAccessArgs = {
  appId: string;
  userId: string;
};

/**
 * True when the user holds a global superadmin row — `app_users` with `app IS NULL`,
 * which grants every permission on every app.
 *
 * {@link resolveChaiAppUserAccess} already honours these rows, so permission checks
 * need no special case. This exists for the code that lists apps: a SQL join on
 * `app_users.app = apps.id` can never match a NULL, so any listing query must ask
 * this question explicitly or superadmins would see nothing.
 */
export async function isChaiGlobalSuperAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await safeQuery(() =>
    db
      .select({ id: schema.appUsers.id })
      .from(schema.appUsers)
      .where(and(isNull(schema.appUsers.app), eq(schema.appUsers.user, userId), eq(schema.appUsers.status, "active")))
      .limit(1),
  );

  if (error) {
    throw new Error("isChaiGlobalSuperAdmin: failed to read app_users", { cause: error });
  }

  return !!data?.[0];
}

/**
 * ChaiBuilder's own answer to "what may this user do in this app?", read from the `app_users`
 * membership table: the row's `role` expanded through the roles table into concrete permission
 * keys, with the row's per-user `permissions` overrides applied on top.
 *
 * Returns `null` when there is no active membership. That is not an error — the caller decides
 * what it means (usually: no access). Call it from your context resolver when you want
 * ChaiBuilder to own authorization:
 *
 * ```ts
 * createChaiBuilder(config, {
 *   context: async ({ request }) => {
 *     const userId = await currentUserId(request);
 *     const access = userId ? await resolveChaiAppUserAccess({ appId, userId }) : null;
 *     return { appId, userId, ...(access ?? {}) };
 *   },
 * });
 * ```
 */
export async function resolveChaiAppUserAccess({
  appId,
  userId,
}: ResolveChaiAppUserAccessArgs): Promise<ChaiAppUserAccess | null> {
  const { data, error } = await safeQuery(() =>
    db
      .select({ role: schema.appUsers.role, permissions: schema.appUsers.permissions })
      .from(schema.appUsers)
      .where(
        and(
          // A NULL app is the global superadmin wildcard — it matches every app.
          or(eq(schema.appUsers.app, appId), isNull(schema.appUsers.app)),
          eq(schema.appUsers.user, userId),
          eq(schema.appUsers.status, "active"),
        ),
      )
      // A user may hold both a global row and a per-app row. Superadmin supersedes,
      // so the global row sorts first; without the ordering the winner is arbitrary.
      .orderBy(sql`(${schema.appUsers.app} is null) desc`)
      .limit(1),
  );

  if (error) {
    throw new Error(`resolveChaiAppUserAccess: failed to read app_users for app "${appId}"`, { cause: error });
  }

  const row = data?.[0];
  if (!row) return null;

  const role = row.role || "user";
  const roleMap = await getChaiGlobalRoles();

  return {
    role,
    permissions: resolveChaiPermissions({
      role,
      roleMap,
      userOverride: row.permissions as Parameters<typeof resolveChaiPermissions>[0]["userOverride"],
      // Runtime catalog, not the static list — plugin-contributed keys must
      // survive wildcard expansion.
      catalog: getChaiPermissionCatalog(),
    }),
  };
}
