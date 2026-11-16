import { eq, getTableColumns, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { mapChaiTables } from "~/db/table-mapping";

// A host table that names Pro's `client` column `company` and carries a column Pro does not know.
const sites = pgTable("sites", {
  id: uuid().primaryKey(),
  company: uuid("company"),
  hostOnly: jsonb("host_only"),
});
const defaults = { apps: pgTable("apps", { id: uuid().primaryKey(), client: uuid() }) };
const mapping = { apps: { table: "sites", columns: { client: "company" } } };

describe("tableMapping column keys", () => {
  it("gives Pro its own column keys over the host's table, host-only columns included", () => {
    const apps = mapChaiTables({ sites }, mapping, defaults).apps as Record<string, unknown>;

    expect(apps.client).toBe(sites.company);
    expect(apps).not.toHaveProperty("company");
    expect(Object.keys(getTableColumns(apps as never))).toEqual(["id", "client", "hostOnly"]);
    expect(getTableName(apps as never)).toBe("sites");
  });

  it("queries the host's SQL columns through Pro's keys", () => {
    const apps = mapChaiTables({ sites }, mapping, defaults).apps as typeof defaults.apps;
    const db = drizzle.mock();

    expect(db.select().from(apps).where(eq(apps.client, "c")).toSQL().sql).toBe(
      'select "id", "company", "host_only" from "sites" where "sites"."company" = $1',
    );
    expect(db.insert(apps).values({ id: "s", client: "c" }).toSQL().sql).toBe(
      'insert into "sites" ("id", "company", "host_only") values ($1, $2, default)',
    );
  });

  it("leaves the host's table and its keys untouched", () => {
    mapChaiTables({ sites }, mapping, defaults);

    expect(Object.keys(getTableColumns(sites))).toEqual(["id", "company", "hostOnly"]);
    expect(sites).not.toHaveProperty("client");
  });

  it("checks Pro's required column keys against the re-keyed view", () => {
    expect(() => mapChaiTables({ sites }, { apps: "sites" }, defaults)).toThrow(
      'mapped table "sites" is missing required column key "client"',
    );
  });

  it("exempts a column the mapping declares absent, and only that one", () => {
    const companies = pgTable("companies", { id: uuid().primaryKey() });
    const clients = pgTable("clients", { id: uuid().primaryKey(), loginHtml: uuid(), theme: uuid() });

    const mapped = mapChaiTables({ companies }, { clients: { table: "companies", columns: { loginHtml: null, theme: null } } }, { clients });
    expect(mapped.clients).toBe(companies);
    expect(() =>
      mapChaiTables({ companies }, { clients: { table: "companies", columns: { loginHtml: null } } }, { clients }),
    ).toThrow('mapped table "companies" is missing required column key "theme"');
  });

  it("rejects a column mapping that names no column of the host's table", () => {
    expect(() => mapChaiTables({ sites }, { apps: { table: "sites", columns: { client: "owner" } } }, defaults)).toThrow(
      'tableMapping.apps.columns.client must name a column of the table (received "owner")',
    );
  });

  it("rejects a Pro key that a different host column already holds", () => {
    const clash = pgTable("sites", { id: uuid().primaryKey(), client: uuid(), company: uuid() });

    expect(() =>
      mapChaiTables({ clash }, { apps: { table: "clash", columns: { client: "company" } } }, defaults),
    ).toThrow("tableMapping.apps.columns.client collides with the table's own \"client\" column");
  });
});
