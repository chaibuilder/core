import "~/server/only-server";
import { DEFAULT_AI_CONFIG } from "./default-ai-config";
import { CHAI_DEFAULT_SERVER_CONFIG } from "./default-server-config";
import { deepMerge, mergeByKey } from "./merge-config";
import { resolveChaiDbConfig } from "./resolve-db-config";
import { ChaiBuilderServerConfigInput, ResolvedChaiAiGlobalConfig, ResolvedChaiBuilderServerConfig } from "./types";

export { CHAI_DEFAULT_SERVER_CONFIG } from "./default-server-config";

function resolveAiConfig(input?: ChaiBuilderServerConfigInput["ai"]): ResolvedChaiAiGlobalConfig {
  if (!input) {
    return { ...DEFAULT_AI_CONFIG };
  }

  return deepMerge(DEFAULT_AI_CONFIG, input);
}

export function resolveChaiBuilderConfig(rawInput: ChaiBuilderServerConfigInput): ResolvedChaiBuilderServerConfig {
  // Plugins are `(config) => config` functions: each sees the previous one's output, and
  // the app's own config object is the input they all build on. Plugin-owned feature keys
  // are excluded from the app input type — a registered plugin sets its own flag (via
  // setPluginFeatures) and its options carry the config, so the plugin's value is final.
  //
  // The append-only keys below are held back from that pass. Plugins contribute to them by
  // appending, and all four resolve last-one-wins (schema fragments spread in order,
  // middleware runs newest-first, setup hooks run in order), so leaving the app's entries in
  // the seed would put them *before* the plugins' and hand plugins the final say. They are
  // concatenated after the reduction instead, keeping app config last as documented.
  const {
    schemaFragments: appSchemaFragments,
    requestMiddlewares: appRequestMiddlewares,
    setupHooks: appSetupHooks,
    contextResolver: appContextResolver,
    ...pluginSeed
  } = rawInput;

  const afterPlugins = (rawInput.plugins ?? []).reduce<ChaiBuilderServerConfigInput>(
    (config, plugin) => plugin(config),
    pluginSeed,
  );

  const input: ChaiBuilderServerConfigInput = {
    ...afterPlugins,
    schemaFragments: [...(afterPlugins.schemaFragments ?? []), ...(appSchemaFragments ?? [])],
    requestMiddlewares: [...(afterPlugins.requestMiddlewares ?? []), ...(appRequestMiddlewares ?? [])],
    setupHooks: [...(afterPlugins.setupHooks ?? []), ...(appSetupHooks ?? [])],
    contextResolver: appContextResolver ?? afterPlugins.contextResolver,
  };
  const ai = resolveAiConfig(input.ai);
  // `builderActions` is the deprecated spelling of `actions`: it is merged first, so on a name
  // clash the current key wins and a host mid-migration can pass either.
  const actions = {
    ...CHAI_DEFAULT_SERVER_CONFIG.actions,
    ...input.builderActions,
    ...input.actions,
  };
  const trash = mergeByKey(CHAI_DEFAULT_SERVER_CONFIG.trash, input.trash, (entry) => entry.key);
  const defaultFeatures = CHAI_DEFAULT_SERVER_CONFIG.features;
  const defaultMediaManager = CHAI_DEFAULT_SERVER_CONFIG.mediaManager;
  // deepMerge skips explicitly-undefined keys, so `{ copyPaste: undefined }` reads as "unset"
  // and falls through to the default rather than shipping undefined to the editor. Nested
  // plugin flags (`revisions: { enabled: true }`) keep the rest of their plugin's defaults.
  const features = deepMerge(defaultFeatures, input.features);
  // `repeaterData` is the deprecated spelling of `chaiCollections`. Both are
  // merged by id, deprecated first, so a host mid-migration can pass either.
  const chaiCollections = mergeByKey(
    mergeByKey(CHAI_DEFAULT_SERVER_CONFIG.chaiCollections ?? [], input.repeaterData, (entry) => entry.id),
    input.chaiCollections,
    (entry) => entry.id,
  );

  const resolved: ResolvedChaiBuilderServerConfig = {
    debugLevel: input.debugLevel ?? CHAI_DEFAULT_SERVER_CONFIG.debugLevel,
    globalDataProvider: input.globalDataProvider ?? CHAI_DEFAULT_SERVER_CONFIG.globalDataProvider,
    onPageNotFound: input.onPageNotFound ?? CHAI_DEFAULT_SERVER_CONFIG.onPageNotFound,
    resolveDynamicTemplateTie: input.resolveDynamicTemplateTie ?? CHAI_DEFAULT_SERVER_CONFIG.resolveDynamicTemplateTie,
    upstreamPageSource: input.upstreamPageSource ?? CHAI_DEFAULT_SERVER_CONFIG.upstreamPageSource,
    pageTypes: mergeByKey(CHAI_DEFAULT_SERVER_CONFIG.pageTypes, input.pageTypes, (entry) => entry.key),
    collections: mergeByKey(CHAI_DEFAULT_SERVER_CONFIG.collections, input.collections, (entry) => entry.id),
    chaiCollections,
    /** @deprecated mirror of `chaiCollections` for hosts still reading this key. */
    repeaterData: chaiCollections,
    blockDataProviders: {
      ...CHAI_DEFAULT_SERVER_CONFIG.blockDataProviders,
      ...input.blockDataProviders,
    },
    trash,
    features: {
      ...features,
      // The two flags that take their default from elsewhere in the config rather than
      // from a fixed value. Everything else is either a core default or plugin-set.
      trash: input.features?.trash ?? trash.length > 0,
      ai: input.features?.ai ?? ai.models.length > 0,
    },
    actions,
    builderActions: actions,
    defaultRoleGrants: input.defaultRoleGrants ?? {},
    roles: input.roles ?? undefined,
    ai,
    mediaManager: deepMerge(defaultMediaManager, input.mediaManager),
    db: resolveChaiDbConfig(input.db),
    schemaFragments: input.schemaFragments ?? [],
    requestMiddlewares: input.requestMiddlewares ?? [],
    setupHooks: input.setupHooks ?? [],
    contextResolver: input.contextResolver,
    transformSiteSettings: input.transformSiteSettings,
  };

  return resolved;
}

export { resolveChaiDbConfig } from "./resolve-db-config";
export type {
  ChaiBuilderServerConfigInput,
  ChaiMediaManagerConfig,
  ChaiMediaManagerConfigInput,
  ChaiDbConfigInput,
  ChaiDbSetup,
  ChaiRolesConfig,
  ResolvedChaiAiGlobalConfig,
  ResolvedChaiBuilderServerConfig,
  ResolvedChaiDbConfig,
} from "./types";

export {
  applyBlockDataProvider,
  resolveBlockDataProvider,
  syncBlockDataProvidersToRegistry,
} from "./block-data-providers";
export { BUILTIN_BUILDER_ACTIONS, BUILTIN_CHAI_ACTIONS } from "./builtin-chai-actions";
export { BUILTIN_GLOBAL_PARTIAL_TYPE, BUILTIN_PAGE_TYPE, BUILTIN_PAGE_TYPES } from "./builtin-page-types";
export {
  fetchConfigGlobalData,
  getActiveChaiBuilderConfig,
  getConfigAction,
  getConfigActions,
  getConfigAI,
  getConfigBlockDataProvider,
  getConfigBlockDataProviders,
  getConfigBuilderAction,
  getConfigBuilderActions,
  getConfigCollection,
  getConfigCollections,
  getConfigChaiCollection,
  getConfigChaiCollections,
  getConfigRepeaterData,
  getConfigRepeaterDataSource,
  getConfigGlobalDataProvider,
  getConfigPageType,
  getConfigPageTypes,
  getConfigSiteSettingsTransform,
  getConfigTrashEntities,
  getConfigTrashEntity,
  getResolvedPageType,
  getResolvedPageTypes,
  getConfigMediaManager,
  getConfigFeature,
  getConfigFeatures,
  isFeatureEnabled,
  setActiveChaiBuilderConfig,
  toChaiPageType,
  updateActiveActions,
  updateActiveAiConfig,
  updateActiveBlockDataProviders,
  updateActiveBuilderActions,
  updateActiveTrash,
} from "./config-registry";
export { DEFAULT_AI_CONFIG } from "./default-ai-config";
export { defaultGlobalDataProvider } from "./default-global-data";
export { deepMerge, mergeByKey } from "./merge-config";
export { serializeAIConfigForClient } from "./serialize-ai-config";
export type { SerializedAIConfig } from "./serialize-ai-config";
export { serializePageTypesForClient } from "./serialize-page-types";
export type { SerializedPageType } from "./serialize-page-types";
