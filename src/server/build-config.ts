import "~/server/only-server";
import { is, Table } from "drizzle-orm";
import { assertChaiTableMappingKeys, rebindChaiRelations } from "~/db/table-mapping";
import { registerChaiDb } from "~/db/core";
import { syncBlockDataProvidersToRegistry } from "~/server/defaults/block-data-providers";
import { setActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { editionServerPlugins } from "~/edition/builtin-server-plugins";
import { EDITION_TABLE_NAMES } from "~/edition/table-names";
import { registerChaiRequestMiddleware } from "~/server/plugin-api/request-middleware";
import type { ChaiSchemaFragment } from "~/types/plugin";
import { registerChaiContextResolver } from "./chai-context-resolver";
import {
  resolveChaiBuilderConfig,
  type ChaiBuilderServerConfigInput,
  type ResolvedChaiBuilderServerConfig,
} from "./defaults";

type ChaiBuilderConfigOnInit = (config: Readonly<ResolvedChaiBuilderServerConfig>) => void | Promise<void>;

const onInitByConfig = new WeakMap<ResolvedChaiBuilderServerConfig, ChaiBuilderConfigOnInit>();

/**
 * Returns the `onInit` callback registered via {@link buildChaiBuilderConfig}, if any.
 * For ChaiBuilder SDK internal use.
 * @internal
 */
export function getChaiBuilderConfigOnInit(
  config: ResolvedChaiBuilderServerConfig,
): ChaiBuilderConfigOnInit | undefined {
  return onInitByConfig.get(config);
}

export type BuildChaiBuilderConfigOptions<TExtra extends Record<string, unknown> = Record<never, never>> = {
  /**
   * Runs once on the first `getChaiBuilder` call for this process.
   */
  onInit?: (config: Readonly<ResolvedChaiBuilderServerConfig>) => void | Promise<void>;
  /**
   * Arbitrary user-defined config merged into the returned config object.
   * Access via `cb.getConfig(key)` on the ChaiBuilder instance.
   */
  extend?: TExtra;
};

/**
 * Build ChaiBuilder server configuration with SDK defaults merged in.
 */
export function buildChaiBuilderConfig<TExtra extends Record<string, unknown> = Record<never, never>>(
  config: ChaiBuilderServerConfigInput,
  options?: BuildChaiBuilderConfigOptions<TExtra>,
): Readonly<ResolvedChaiBuilderServerConfig & TExtra> {
  // Edition-level always-on plugins run first so app/plugin config still gets
  // the last word on everything else they touch.
  const resolved = resolveChaiBuilderConfig({
    ...config,
    plugins: [...editionServerPlugins(), ...(config.plugins ?? [])],
  });
  const extended = { ...resolved, ...(options?.extend ?? {}) } as ResolvedChaiBuilderServerConfig & TExtra;
  extended.db = withPluginSchema(extended.db, extended.schemaFragments);
  registerChaiDb(extended.db);
  setActiveChaiBuilderConfig(extended);
  syncBlockDataProvidersToRegistry(extended.blockDataProviders);
  registerPluginRuntime(extended);
  if (options?.onInit) {
    onInitByConfig.set(extended, options.onInit);
  }
  return Object.freeze(extended);
}

/** Merges each contributed schema fragment for the active dialect into the DB setup. */
function withPluginSchema(
  db: ResolvedChaiBuilderServerConfig["db"],
  schemaFragments: ChaiSchemaFragment[],
): ResolvedChaiBuilderServerConfig["db"] {
  const dialect = db.dialect ?? "pg";
  let fragments: Record<string, unknown> = {};
  for (const entry of schemaFragments) {
    // Later app plugins override edition defaults.
    fragments = { ...fragments, ...entry[dialect] };
  }
  const tableKeys = Object.keys(fragments).filter((key) => is(fragments[key], Table));
  // Every table the edition declares, registered plugin or not: the edition's schema creates a
  // plugin's tables whether or not the plugin is registered (enabling it later needs no
  // migration), so a host renaming one must be able to map it.
  assertChaiTableMappingKeys(db.tableMapping, [...Object.keys(EDITION_TABLE_NAMES), ...tableKeys]);

  // A fragment replaces what the adapter filled in by default; an entry the host supplied itself
  // (`tables`, `tableMapping`) is anything that differs from its default, and it wins over every fragment.
  const defaults = db.schemaDefaults;
  const supplied = (key: string) => defaults !== undefined && key in db.schema && db.schema[key] !== defaults[key];
  let merged = db.schema;
  for (const [key, value] of Object.entries(fragments)) {
    if (supplied(key) || db.schema[key] === value) continue;
    if (merged === db.schema) merged = { ...db.schema };
    merged[key] = value;
  }
  const schema = rebindChaiRelations(merged, [defaults ?? {}, ...schemaFragments.map((entry) => entry[dialect] ?? {})]);
  if (schema === db.schema) {
    return db;
  }
  // Rebuild the drizzle instance over the same connection where the adapter
  // allows it, so `db.query.<pluginTable>` sees the merged schema too.
  const drizzle = db.withSchema ? db.withSchema(schema) : db.drizzle;
  return { ...db, drizzle, schema };
}

/** Registers the context resolver, request middleware, and setup callbacks the plugins contributed. */
function registerPluginRuntime(config: Readonly<ResolvedChaiBuilderServerConfig>): void {
  if (config.contextResolver) {
    // Last plugin to set it wins; a later `createChaiBuilder(config, { context })` wins over all.
    registerChaiContextResolver(config.contextResolver);
  }
  for (const { name, handler } of config.requestMiddlewares) {
    registerChaiRequestMiddleware(name, handler);
  }
  for (const setup of config.setupHooks) {
    setup({ config });
  }
}
