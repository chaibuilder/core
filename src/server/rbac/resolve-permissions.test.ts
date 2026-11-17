import { describe, expect, it } from "vitest";
import { resolveChaiPermissions } from "./resolve-permissions";

const catalog = ["pages:read", "pages:create", "pages:delete", "assets:read", "assets:delete", "users:remove"];

const roleMap = {
  editor: { permissions: ["pages:*", "assets:read"] },
  viewer: { permissions: ["pages:read"] },
  admin: { permissions: ["*"] },
};

describe("resolvePermissions", () => {
  it("returns role permissions from roleMap", () => {
    const result = resolveChaiPermissions({ role: "viewer", roleMap, catalog });
    expect(result).toEqual(["pages:read"]);
  });

  it("expands entity wildcard from role", () => {
    const result = resolveChaiPermissions({ role: "editor", roleMap, catalog });
    expect(result).toContain("pages:read");
    expect(result).toContain("pages:create");
    expect(result).toContain("pages:delete");
    expect(result).toContain("assets:read");
    expect(result).not.toContain("assets:delete");
  });

  it("expands * from admin role", () => {
    const result = resolveChaiPermissions({ role: "admin", roleMap, catalog });
    expect(result).toEqual(expect.arrayContaining(catalog));
  });

  it("returns empty for unknown role with no roleMap entry", () => {
    const result = resolveChaiPermissions({ role: "ghost", roleMap, catalog });
    expect(result).toEqual([]);
  });

  it("returns defaults when roleMap is null", () => {
    const result = resolveChaiPermissions({ role: "viewer", roleMap: null, catalog });
    expect(result).toEqual([]);
  });

  it("applies array-form userOverride as additive grants", () => {
    const result = resolveChaiPermissions({
      role: "viewer",
      roleMap,
      catalog,
      userOverride: ["assets:read"],
    });
    expect(result).toContain("pages:read");
    expect(result).toContain("assets:read");
  });

  it("applies map-form userOverride true to grant", () => {
    const result = resolveChaiPermissions({
      role: "viewer",
      roleMap,
      catalog,
      userOverride: { "assets:delete": true },
    });
    expect(result).toContain("pages:read");
    expect(result).toContain("assets:delete");
  });

  it("applies map-form userOverride false to revoke", () => {
    const result = resolveChaiPermissions({
      role: "editor",
      roleMap,
      catalog,
      userOverride: { "pages:delete": false },
    });
    expect(result).toContain("pages:read");
    expect(result).not.toContain("pages:delete");
  });

  it("revoke wins over entity wildcard grant", () => {
    const result = resolveChaiPermissions({
      role: "admin",
      roleMap,
      catalog,
      userOverride: { "users:remove": false },
    });
    expect(result).not.toContain("users:remove");
  });

  it("userOverride entity:* revokes all ops in entity", () => {
    const result = resolveChaiPermissions({
      role: "admin",
      roleMap,
      catalog,
      userOverride: { "pages:*": false },
    });
    expect(result).not.toContain("pages:read");
    expect(result).not.toContain("pages:create");
    expect(result).not.toContain("pages:delete");
    expect(result).toContain("assets:read");
  });
});
