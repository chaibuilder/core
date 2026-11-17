import type { ChaiContextResolver } from "~/types/chaibuilder-config";
import type { ChaiBuilderServerConfigInput, ResolvedChaiBuilderServerConfig } from "~/types/server-config";

/**
 * Drizzle table/relation objects contributed by a plugin, keyed by export name.
 * The fragment matching the active dialect is merged into the DB schema at
 * `buildChaiBuilderConfig` time, before `registerChaiDb`.
 */
export type ChaiSchemaFragment = {
  pg?: Record<string, unknown>;
  sqlite?: Record<string, unknown>;
};

export type ChaiRequestMiddlewareArgs = {
  /** The unresolved request path, e.g. `/about-us`. */
  slug: string;
  lang: string;
};

export type ChaiRequestMiddlewareResult = { redirect: string; permanent: boolean } | null;

/**
 * Runs while resolving a public page request, before 404 handling. Return a
 * redirect target to send the visitor elsewhere, or null to let resolution
 * continue.
 */
export type ChaiRequestMiddleware = (args: ChaiRequestMiddlewareArgs) => Promise<ChaiRequestMiddlewareResult>;

/** A named request middleware entry, so re-registration under the same name replaces. */
export type ChaiRequestMiddlewareEntry = {
  /** Unique subscriber id, e.g. `"chai:redirects"`. */
  name: string;
  handler: ChaiRequestMiddleware;
};

/** Imperative escape hatch; runs at the end of `buildChaiBuilderConfig` with the resolved config. */
export type ChaiSetupHook = (ctx: { config: Readonly<ResolvedChaiBuilderServerConfig> }) => void;

/**
 * A server-side ChaiBuilder plugin: a function that takes the config being
 * built and returns the next one. Everything a feature contributes — actions,
 * permissions, feature flags, DB schema fragments, request middleware, setup
 * hooks, instance namespaces (`registerChaiInstanceApi` → `cb.<namespace>.*`)
 * — is expressed as config, so nothing about the feature has to be
 * pre-declared by the core.
 *
 * Plugins run in array order, each seeing the previous one's output.
 *
 * The rest of this comment is how ChaiBuilder's own plugins own a feature flag.
 * `setPluginFeatures` and the `~/types/server-config` augmentation are internal
 * to the package; a host plugin reads its own options instead. Registering a
 * built-in plugin enables its feature; the plugin's options carry the
 * fine-grained config, and the plugin sets its own flag unconditionally:
 *
 * ```ts
 * export const widgetsPlugin = (options?: WidgetsOptions): ChaiServerPlugin =>
 *   defineChaiServerPlugin(
 *     (config) => ({
 *       ...setPluginFeatures(config, { widgets: options?.enabled ?? true }),
 *       actions: { GET_WIDGETS: new GetWidgetsAction(), ...config.actions },
 *     }),
 *     { name: "chai:widgets" },
 *   );
 * ```
 *
 * A plugin that owns a config key also declares its *type*, by augmenting the
 * matching plugin interface (`ChaiPluginFeatures`,
 * `ChaiPluginMediaManagerConfig`). Keep the augmentation in its own module and
 * side-effect-import it from the plugin entry, so the key travels with the
 * plugin:
 *
 * ```ts
 * // widgets/server/config.ts
 * declare module "~/types/server-config" {
 *   interface ChaiPluginFeatures {
 *     widgets?: boolean;   // optional: absent means the plugin is not registered
 *   }
 * }
 *
 * // widgets/server/index.ts
 * import "./config";
 * ```
 *
 * The key then exists in the config type exactly when the plugin is part of the
 * TypeScript program — an OSS build without it has no such key to set.
 */
export type ChaiServerPlugin = ((config: ChaiBuilderServerConfigInput) => ChaiBuilderServerConfigInput) & {
  /** Stable plugin id, e.g. `"chai:redirects"`. Set via `defineChaiServerPlugin(fn, { name })`. */
  pluginName?: string;
};

export type { ChaiContextResolver };
