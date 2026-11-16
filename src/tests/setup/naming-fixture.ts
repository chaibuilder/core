import type { ChaiDbNaming } from "~/drizzle/naming";

/**
 * The naming the custom-naming tests build their schema from: a prefix on every table, explicit
 * names for the busiest tables (one in object form), and every relationship column renamed, so
 * nothing default-named survives.
 */
export const TEST_DB_NAMING = {
  tablePrefix: "cb_",
  tables: {
    apps: "websites",
    appsOnline: "websites_online",
    appPages: { name: "website_pages", columns: { parent: "parent_page" } },
    appPagesOnline: "website_pages_online",
  },
  columns: {
    app: "website_id",
    client: "client_id",
    library: "library_id",
    parent: "parent_id",
    pageId: "page_id",
    clientId: "client_ref",
    user: "user_id",
  },
} satisfies ChaiDbNaming;
