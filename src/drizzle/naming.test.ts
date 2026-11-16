import { describe, expect, it } from "vitest";
import { CORE_TABLE_NAMES, resolveChaiDbNaming, warnUnknownChaiTableKeys } from "./naming";

describe("resolveChaiDbNaming", () => {
  it("returns the defaults when nothing is configured", () => {
    const n = resolveChaiDbNaming(undefined, CORE_TABLE_NAMES);
    expect(n.table("apps")).toBe("apps");
    expect(n.table("appPages")).toBe("app_pages");
    expect(n.column("appPages", "app")).toBe("");
    expect(n.ident("appPages", "app_pages_app_fkey", (t) => `${t}_app_fkey`)).toBe("app_pages_app_fkey");
  });

  it("resolves a table override, then the prefix, then the default", () => {
    const n = resolveChaiDbNaming({ tablePrefix: "chai_", tables: { apps: "websites" } }, CORE_TABLE_NAMES);
    expect(n.table("apps")).toBe("websites");
    expect(n.table("appPages")).toBe("chai_app_pages");
    expect(n.table("clients")).toBe("chai_clients");
  });

  it("accepts the object form of a table entry", () => {
    const n = resolveChaiDbNaming({ tables: { appPages: { name: "website_pages" } } }, CORE_TABLE_NAMES);
    expect(n.table("appPages")).toBe("website_pages");
    expect(n.table("apps")).toBe("apps");
  });

  it("resolves a per-table column over the global column, and leaves untouched columns unnamed", () => {
    const n = resolveChaiDbNaming(
      { columns: { app: "website_id" }, tables: { libraries: { columns: { app: "site" } } } },
      CORE_TABLE_NAMES,
    );
    expect(n.column("appPages", "app")).toBe("website_id");
    expect(n.column("libraries", "app")).toBe("site");
    expect(n.column("appPages", "parent")).toBe("");
  });

  it("treats a column renamed to its own key as untouched", () => {
    const n = resolveChaiDbNaming({ columns: { app: "app" } }, CORE_TABLE_NAMES);
    expect(n.column("appPages", "app")).toBe("");
  });

  it("derives constraint names only when the table is renamed", () => {
    const n = resolveChaiDbNaming({ tables: { apps: "websites" }, columns: { client: "client_id" } }, CORE_TABLE_NAMES);
    expect(n.ident("apps", "apps_client_fkey", (t) => `${t}_client_fkey`)).toBe("websites_client_fkey");
    // column rename alone never changes an identifier
    expect(n.ident("appsOnline", "apps_online_client_fkey", (t) => `${t}_client_fkey`)).toBe("apps_online_client_fkey");
    const prefixed = resolveChaiDbNaming({ tablePrefix: "chai_" }, CORE_TABLE_NAMES);
    expect(prefixed.ident("appPages", "idx_app_pages_app_slug", (t) => `idx_${t}_app_slug`)).toBe(
      "idx_chai_app_pages_app_slug",
    );
  });

  it("rejects a table key the factory does not own", () => {
    const n = resolveChaiDbNaming(undefined, CORE_TABLE_NAMES);
    expect(() => (n.table as (key: string) => string)("appTrash")).toThrow(/unknown table key "appTrash"/);
  });
});

describe("warnUnknownChaiTableKeys", () => {
  it("returns the keys no factory owns", () => {
    expect(warnUnknownChaiTableKeys({ tables: { apps: "a", appPage: "b" } }, ["apps", "appPages"])).toEqual([
      "appPage",
    ]);
    expect(warnUnknownChaiTableKeys(undefined, ["apps"])).toEqual([]);
  });
});
