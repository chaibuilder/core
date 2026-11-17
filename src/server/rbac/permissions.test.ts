import { describe, expect, it } from "vitest";
import { expandChaiGrantMap, hasChaiPermission, intersectChaiPermissions } from "./permissions";

describe("hasPermission", () => {
  it("returns true when no required permission", () => {
    expect(hasChaiPermission(null, "")).toBe(true);
  });

  it("returns false when granted is empty", () => {
    expect(hasChaiPermission([], "pages:read")).toBe(false);
    expect(hasChaiPermission(null, "pages:read")).toBe(false);
  });

  it("matches exact permission", () => {
    expect(hasChaiPermission(["pages:read", "pages:create"], "pages:read")).toBe(true);
  });

  it("returns false when exact permission missing", () => {
    expect(hasChaiPermission(["pages:create"], "pages:read")).toBe(false);
  });

  it("matches wildcard-all *", () => {
    expect(hasChaiPermission(["*"], "pages:read")).toBe(true);
    expect(hasChaiPermission(["*"], "users:remove")).toBe(true);
  });

  it("lets a retired key a stored role still grants satisfy its replacement", () => {
    expect(hasChaiPermission(["app:publish_theme"], "theme:publish")).toBe(true);
    expect(hasChaiPermission(["design_tokens:publish"], "theme:publish")).toBe(true);
    expect(hasChaiPermission(["app:*"], "theme:publish")).toBe(true);
    expect(hasChaiPermission(["app:publish_theme"], "theme:edit")).toBe(false);
    expect(hasChaiPermission(["theme:publish"], "app:publish_theme")).toBe(false);
  });

  it("matches entity wildcard pages:*", () => {
    expect(hasChaiPermission(["pages:*"], "pages:read")).toBe(true);
    expect(hasChaiPermission(["pages:*"], "pages:delete")).toBe(true);
    expect(hasChaiPermission(["pages:*"], "assets:read")).toBe(false);
  });
});

describe("expandGrantMap", () => {
  it("returns empty array for null/undefined", () => {
    expect(expandChaiGrantMap(null)).toEqual([]);
    expect(expandChaiGrantMap(undefined)).toEqual([]);
  });

  it("expands * to full catalog", () => {
    const result = expandChaiGrantMap({ "*": true }, ["pages:read", "pages:create", "assets:read"]);
    expect(result).toEqual(expect.arrayContaining(["pages:read", "pages:create", "assets:read"]));
  });

  it("expands entity:* to entity ops only", () => {
    const result = expandChaiGrantMap({ "pages:*": true }, ["pages:read", "pages:create", "assets:read"]);
    expect(result).toContain("pages:read");
    expect(result).toContain("pages:create");
    expect(result).not.toContain("assets:read");
  });

  it("grants explicit keys", () => {
    const result = expandChaiGrantMap({ "pages:read": true, "assets:read": true }, [
      "pages:read",
      "pages:create",
      "assets:read",
    ]);
    expect(result).toEqual(expect.arrayContaining(["pages:read", "assets:read"]));
    expect(result).not.toContain("pages:create");
  });

  it("revoke false wins over wildcard grant", () => {
    const result = expandChaiGrantMap({ "*": true, "pages:delete": false }, [
      "pages:read",
      "pages:delete",
      "assets:read",
    ]);
    expect(result).toContain("pages:read");
    expect(result).not.toContain("pages:delete");
  });

  it("revokes entity:* after wildcard-all grant", () => {
    const result = expandChaiGrantMap({ "*": true, "pages:*": false }, ["pages:read", "pages:create", "assets:read"]);
    expect(result).not.toContain("pages:read");
    expect(result).not.toContain("pages:create");
    expect(result).toContain("assets:read");
  });
});

describe("intersectPermissions", () => {
  const catalog = ["pages:read", "pages:create", "pages:delete", "assets:read"];

  it("returns intersection of two concrete lists", () => {
    expect(intersectChaiPermissions(["pages:read", "pages:create"], ["pages:read", "assets:read"], catalog)).toEqual([
      "pages:read",
    ]);
  });

  it("expands wildcards before intersecting", () => {
    const result = intersectChaiPermissions(["pages:*"], ["pages:read", "assets:read"], catalog);
    expect(result).toContain("pages:read");
    expect(result).not.toContain("assets:read");
    expect(result).not.toContain("pages:create");
  });

  it("returns empty when no overlap", () => {
    expect(intersectChaiPermissions(["pages:create"], ["assets:read"], catalog)).toEqual([]);
  });

  it("returns full catalog when both sides are *", () => {
    const result = intersectChaiPermissions(["*"], ["*"], catalog);
    expect(result).toEqual(expect.arrayContaining(catalog));
  });
});
