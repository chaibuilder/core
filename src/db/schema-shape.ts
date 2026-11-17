import type * as coreSchema from "~/drizzle/schema.sqlite";

/**
 * Shape of the active ChaiBuilder schema as seen by core code.
 *
 * Core table names come from the (dialect-neutral) core schema so `schema.appPages`
 * autocompletes, but every entry is deliberately `any`: the same query code runs
 * against pg and sqlite table objects (see `asDbInstance`), so column-level typing
 * cannot be pinned to either dialect here. The index signature admits tables that
 * plugins merge in at `registerChaiDb` time; only the plugin that owns such a table
 * reads it.
 */
export type ChaiCoreSchema = { [K in keyof typeof coreSchema]: any } & Record<string, any>;
