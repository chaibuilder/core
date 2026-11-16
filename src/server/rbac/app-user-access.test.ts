import { beforeEach, describe, expect, it } from "vitest";
import { registerChaiPermissions, resetChaiPermissionsForTests } from "~/server/plugin-api/permission-registry";
import type { ChaiDefaultRoleGrants } from "~/types/server-config";
import { withChaiConfig } from "~/tests/setup/chai-config";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { isChaiGlobalSuperAdmin, resolveChaiAppUserAccess } from "./app-user-access";

const USER_ID = "user-1";

/** Registers plugin permission keys in the real registry (reset per test). */
const registerExtras = (keys: string[]) => registerChaiPermissions("test:extras", keys);

/**
 * No `roles` config, so the real role resolution runs and the built-in DEFAULT_ROLE_MAPS fallback
 * is exercised end to end, with `grants` as the plugin-contributed default-role grants.
 */
const useDefaultRoles = (grants: ChaiDefaultRoleGrants = {}) =>
  withChaiConfig({ roles: undefined, defaultRoleGrants: grants });

/** Seeds this user's membership row for the test app (or a global row with `app: null`). */
const membership = (row: { role: string | null; permissions?: unknown; app?: string | null; status?: string }) =>
  withTestDB(({ seed }) => seed("appUsers", { app: TEST_APP_ID, user: USER_ID, permissions: null, ...row } as never));

const resolve = (appId = TEST_APP_ID) => resolveChaiAppUserAccess({ appId, userId: USER_ID });

describe("resolveChaiAppUserAccess", () => {
  beforeEach(() => {
    resetChaiPermissionsForTests();
    useDefaultRoles();
  });

  // The membership row carries a role, not a permission list — `permissions` is null unless
  // someone has overridden it per user. The role's own grants are what should apply.
  it("resolves a null permissions column from the role's built-in grants", async () => {
    await membership({ role: "viewer" });

    await expect(resolve()).resolves.toEqual({
      role: "viewer",
      permissions: ["app:read", "pages:read", "partials:read", "assets:read", "library:read"],
    });
  });

  // Plugin-contributed keys: extras widen the catalog, grants land on the fallback roles.
  it("includes plugin-contributed grants and expands them against the widened catalog", async () => {
    registerExtras(["redirects:read", "revisions:read", "revisions:restore", "revisions:delete"]);
    useDefaultRoles({ viewer: ["redirects:read", "revisions:read"], editor: ["revisions:*"] });
    await membership({ role: "viewer" });

    const access = await resolve();

    expect(access?.permissions).toContain("redirects:read");
    expect(access?.permissions).toContain("revisions:read");
  });

  it("expands a contributed entity wildcard grant against the widened catalog", async () => {
    registerExtras(["revisions:read", "revisions:restore", "revisions:delete"]);
    useDefaultRoles({ editor: ["revisions:*"] });
    await membership({ role: "editor" });

    const access = await resolve();

    expect(access?.permissions).toEqual(
      expect.arrayContaining(["revisions:read", "revisions:restore", "revisions:delete"]),
    );
  });

  it("wildcard roles cover plugin-contributed keys once extras widen the catalog", async () => {
    registerExtras(["redirects:read"]);
    await membership({ role: "admin" });

    expect((await resolve())?.permissions).toContain("redirects:read");
  });

  it("excludes plugin keys when no extras are registered", async () => {
    await membership({ role: "admin" });

    expect((await resolve())?.permissions).not.toContain("redirects:read");
  });

  it("expands an admin's wildcard against the whole catalog", async () => {
    await membership({ role: "admin" });

    const access = await resolve();

    expect(access?.role).toBe("admin");
    expect(access?.permissions).toContain("pages:create");
    expect(access?.permissions).toContain("users:update_role");
    expect(access?.permissions.length).toBeGreaterThan(10);
  });

  it("returns null when the user has no active membership", async () => {
    await membership({ role: "admin", status: "inactive" });
    await withTestDB(({ seed }) => seed("appUsers", { app: TEST_APP_ID, user: "someone-else", role: "admin" }));

    await expect(resolve()).resolves.toBeNull();
  });

  it("applies per-user grants on top of the role", async () => {
    await membership({ role: "viewer", permissions: { "pages:update": true } });

    const access = await resolve();

    expect(access?.permissions).toContain("pages:update");
    expect(access?.permissions).toContain("pages:read");
  });

  it("lets a per-user revoke override the role's grant", async () => {
    await membership({ role: "viewer", permissions: { "pages:read": false } });

    const access = await resolve();

    expect(access?.permissions).not.toContain("pages:read");
    expect(access?.permissions).toContain("assets:read");
  });

  it("falls back to the 'user' role when the row has none", async () => {
    await membership({ role: null });

    await expect(resolve()).resolves.toEqual({ role: "user", permissions: ["app:read", "pages:read"] });
  });

  it("grants nothing for a role no map defines", async () => {
    await membership({ role: "not-a-role" });

    await expect(resolve()).resolves.toEqual({ role: "not-a-role", permissions: [] });
  });

  it("surfaces a database failure rather than reporting no access", async () => {
    await membership({ role: "admin" });

    await withTableUnavailable(schema.appUsers, async () => {
      await expect(resolve()).rejects.toThrow(/failed to read app_users/);
    });
  });

  // A global row (app IS NULL) is matched by the same query, so a superadmin needs no
  // special case at the permission layer — the role's own grants do the work.
  it("expands a global superadmin row to every permission, including plugin keys", async () => {
    registerExtras(["redirects:manage"]);
    await membership({ role: "superadmin", app: null });

    const access = await resolve("any-app");

    expect(access?.role).toBe("superadmin");
    expect(access?.permissions).toContain("redirects:manage");
    expect(access?.permissions).toEqual(expect.arrayContaining(["app:read", "pages:publish", "theme:edit"]));
  });

  it("prefers the global superadmin row over a per-app row", async () => {
    await membership({ role: "viewer" });
    await membership({ role: "superadmin", app: null });

    expect((await resolve())?.role).toBe("superadmin");
  });
});

describe("isChaiGlobalSuperAdmin", () => {
  beforeEach(() => {
    resetChaiPermissionsForTests();
    useDefaultRoles();
  });

  it("is true when an active global row exists", async () => {
    await membership({ role: "superadmin", app: null });

    await expect(isChaiGlobalSuperAdmin(USER_ID)).resolves.toBe(true);
  });

  it("is false when no global row matches", async () => {
    // A per-app row and an inactive global row are not global superadmin grants.
    await membership({ role: "admin" });
    await membership({ role: "superadmin", app: null, status: "inactive" });

    await expect(isChaiGlobalSuperAdmin(USER_ID)).resolves.toBe(false);
  });

  it("is false for an empty user id without querying", async () => {
    // With the table gone any query would throw, so a `false` proves no query ran.
    await withTableUnavailable(schema.appUsers, async () => {
      await expect(isChaiGlobalSuperAdmin("")).resolves.toBe(false);
    });
  });

  // Listing code decides visibility from this answer, so a failed read must not be
  // reported as "not a superadmin" — that would silently hide every site.
  it("throws on a database failure rather than reporting false", async () => {
    await withTableUnavailable(schema.appUsers, async () => {
      await expect(isChaiGlobalSuperAdmin(USER_ID)).rejects.toThrow(/failed to read app_users/);
    });
  });
});
