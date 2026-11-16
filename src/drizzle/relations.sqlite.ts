import { createCoreSqliteRelations } from "./schema-factory.sqlite";
import * as tables from "./schema.sqlite";

const defaults = createCoreSqliteRelations(tables);
export const appsRelations = defaults.appsRelations;
export const clientsRelations = defaults.clientsRelations;
export const appsOnlineRelations = defaults.appsOnlineRelations;
export const librariesRelations = defaults.librariesRelations;
export const appUsersRelations = defaults.appUsersRelations;
export const appPagesRelations = defaults.appPagesRelations;
export const appAssetsRelations = defaults.appAssetsRelations;
export const libraryTemplatesRelations = defaults.libraryTemplatesRelations;
export const appPagesOnlineRelations = defaults.appPagesOnlineRelations;
export const libraryItemsRelations = defaults.libraryItemsRelations;
