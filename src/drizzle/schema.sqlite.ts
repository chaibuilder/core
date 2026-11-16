// The core sqlite tables under the default naming. Declared in ./schema-factory.sqlite.ts; this
// module is what `export *` consumers (the schema barrels, drizzle-kit, the test harness) read.
// Renamed tables come from `createChaiSqliteSchema(naming)` (`<pkg>/db/schema-factory`).
import { createCoreSqliteSchema } from "./schema-factory.sqlite";

const defaults = createCoreSqliteSchema();
export const apps = defaults.apps;
export const appsOnline = defaults.appsOnline;
export const libraries = defaults.libraries;
export const clients = defaults.clients;
export const appUsers = defaults.appUsers;
export const appPages = defaults.appPages;
export const appAssets = defaults.appAssets;
export const libraryTemplates = defaults.libraryTemplates;
export const appPagesOnline = defaults.appPagesOnline;
export const libraryItems = defaults.libraryItems;
export const aiLogs = defaults.aiLogs;
