import { resetChaiDbForTests } from "~/server/chai-actions/db";
import { normalizeHandlerRedirect } from "~/server/utils/redirect-path";
import type { ChaiPageType } from "~/types/actions";
import type {
  ChaiBlockDataProvider,
  ChaiDynamicTemplateCandidate,
  ChaiPageNotFoundArgs,
  ChaiPageTypeEntry,
  ChaiRepeaterDataEntry,
  ChaiTrashEntry,
} from "~/types/chaibuilder-config";
import type { ChaiCollectionEntry } from "~/types/deprecated";
import { CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG } from "./core-default-server-config";
import type {
  ChaiDefaultRoleGrants,
  ChaiMediaManagerConfig,
  ChaiRolesConfig,
  ChaiServerFeatures,
  ResolvedChaiAiGlobalConfig,
  ResolvedChaiBuilderServerConfig,
} from "./types";

let activeConfig: ResolvedChaiBuilderServerConfig = CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG;

/** Builtin actions, seeded by `default-server-config.ts` (importing them here would close a cycle). */
let builtinActions: ResolvedChaiBuilderServerConfig["actions"] = {};

/**
 * @internal Seeds the builtin actions so lookups before `setActiveChaiBuilderConfig` (and after
 * `resetActiveChaiBuilderConfigForTests`) still find them, as they did when the registry started
 * from the full defaults.
 */
export function seedBuiltinChaiActions(actions: ResolvedChaiBuilderServerConfig["actions"]): void {
  builtinActions = actions;
  if (activeConfig === CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG) {
    activeConfig = { ...activeConfig, actions, builderActions: actions };
  }
}

/** Set the active resolved config (called from buildChaiBuilderConfig and getChaiBuilder sync). */
export function setActiveChaiBuilderConfig(config: ResolvedChaiBuilderServerConfig): void {
  activeConfig = config;
}

export function getActiveChaiBuilderConfig(): Readonly<ResolvedChaiBuilderServerConfig> {
  return activeConfig;
}

export function getConfigPageTypes(): ChaiPageTypeEntry[] {
  return activeConfig.pageTypes;
}

export function getConfigPageType(key: string): ChaiPageTypeEntry | undefined {
  return activeConfig.pageTypes.find((pageType) => pageType.key === key);
}

/** Resolved page type for legacy ChaiPageType consumers. */
export function getResolvedPageType(key: string): ChaiPageType | undefined {
  const entry = getConfigPageType(key);
  return entry ? toChaiPageType(entry) : undefined;
}

/** Resolved page types for legacy ChaiPageType consumers. */
export function getResolvedPageTypes(): ChaiPageType[] {
  return getConfigPageTypes().map(toChaiPageType);
}

/** @deprecated Use `getConfigChaiCollections` instead. */
export function getConfigCollections(): ChaiCollectionEntry[] {
  return activeConfig.collections;
}

/** @deprecated Use `getConfigChaiCollection` instead. */
export function getConfigCollection(id: string): ChaiCollectionEntry | undefined {
  return activeConfig.collections.find((collection) => collection.id === id);
}

export function getConfigChaiCollections(): ChaiRepeaterDataEntry[] {
  // Both keys are optional on the resolved config — a host config built before
  // either key existed still resolves to undefined here. `repeaterData` is the
  // deprecated spelling. Falling back on *empty* and not just on undefined is
  // deliberate: a hand-built resolved config that spreads the defaults picks up
  // `chaiCollections: []` even when it only sets `repeaterData`, and an empty
  // `chaiCollections` never means "deliberately hide the deprecated entries" —
  // resolveConfig() writes the same array to both keys.
  const chaiCollections = activeConfig.chaiCollections ?? [];
  if (chaiCollections.length > 0) return chaiCollections;
  return activeConfig.repeaterData ?? [];
}

export function getConfigChaiCollection(id: string): ChaiRepeaterDataEntry | undefined {
  return getConfigChaiCollections().find((source) => source.id === id);
}

/** @deprecated Use `getConfigChaiCollections` instead. */
export function getConfigRepeaterData(): ChaiRepeaterDataEntry[] {
  return getConfigChaiCollections();
}

/** @deprecated Use `getConfigChaiCollection` instead. */
export function getConfigRepeaterDataSource(id: string): ChaiRepeaterDataEntry | undefined {
  return getConfigChaiCollection(id);
}

export function getConfigTrashEntities(): ChaiTrashEntry[] {
  return activeConfig.trash;
}

export function getConfigTrashEntity(key: string): ChaiTrashEntry | undefined {
  return activeConfig.trash.find((entity) => entity.key === key);
}

export function getConfigFeatures(): ChaiServerFeatures {
  return activeConfig.features;
}

/**
 * Read one feature flag. Undefined means the flag was never declared — i.e. the plugin
 * that owns it is not registered, which every caller should treat as "off".
 */
export function getConfigFeature<K extends keyof ChaiServerFeatures>(key: K): ChaiServerFeatures[K] | undefined {
  return activeConfig.features[key];
}

/** True for a `true` flag or an enabled object flag (`{ enabled: true }`); false when absent. */
export function isFeatureEnabled(key: keyof ChaiServerFeatures): boolean {
  const value = activeConfig.features[key];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") return (value as { enabled?: boolean }).enabled === true;
  return false;
}

export function getConfigGlobalDataProvider(): ResolvedChaiBuilderServerConfig["globalDataProvider"] {
  return activeConfig.globalDataProvider;
}

export async function fetchConfigGlobalData(args: {
  lang: string;
  draft: boolean;
  inBuilder: boolean;
}): Promise<Record<string, unknown>> {
  try {
    return ((await getConfigGlobalDataProvider()(args)) ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.error(error);
    return {};
  }
}

export function getConfigSiteSettingsTransform(): ResolvedChaiBuilderServerConfig["transformSiteSettings"] {
  return activeConfig.transformSiteSettings;
}

export function getConfigPageNotFoundHandler(): ResolvedChaiBuilderServerConfig["onPageNotFound"] {
  return activeConfig.onPageNotFound;
}

/**
 * Ask the app what to do with an unresolved path. Returns a redirect target, or null to 404.
 *
 * The handler is app code running mid-render against a visitor-controlled path, so its answer
 * is treated as untrusted: a throw, a malformed return, a protocol-relative or non-http(s)
 * target, or a redirect back to the same path all degrade to a plain 404 rather than breaking
 * the response, bouncing the visitor in a loop, or sending them to another origin by accident.
 */
export async function resolveConfigPageNotFound(
  args: ChaiPageNotFoundArgs,
): Promise<{ redirect: string; permanent: boolean } | null> {
  const handler = activeConfig.onPageNotFound;
  if (!handler) return null;

  try {
    const result = await handler(args);
    if (!result || !("redirect" in result)) return null;

    const target = normalizeHandlerRedirect(result.redirect);
    if (!target || target === args.slug) return null;

    return { redirect: target, permanent: Boolean(result.permanent) };
  } catch (error) {
    console.error("onPageNotFound handler failed:", { slug: args.slug, error });
    return null;
  }
}

/**
 * Arbitrate between dynamic templates that all match one URL. Returns the chosen
 * candidate, or `candidates[0]` (the registration-order default) when no handler
 * is registered, fewer than two candidates compete, or the handler declines.
 *
 * The handler is host code running mid-render against a visitor-controlled path,
 * so its answer is untrusted: a throw or a return outside the candidate set both
 * degrade to the default rather than steering the resolver to an unrelated page.
 */
export async function resolveConfigDynamicTemplateTie<T extends ChaiDynamicTemplateCandidate>(
  candidates: T[],
  slug: string,
): Promise<T | undefined> {
  const fallback = candidates[0];
  const handler = activeConfig.resolveDynamicTemplateTie;
  // Nothing to arbitrate for an empty set (undefined fallback) or a single
  // candidate; the handler only runs on a genuine multi-candidate tie.
  if (!handler || candidates.length < 2) return fallback;

  try {
    const chosen = await handler(candidates, slug);
    return chosen && candidates.includes(chosen) ? chosen : fallback;
  } catch (error) {
    console.error("resolveDynamicTemplateTie handler failed:", { slug, error });
    return fallback;
  }
}

export function getConfigUpstreamPageSource(): ResolvedChaiBuilderServerConfig["upstreamPageSource"] {
  return activeConfig.upstreamPageSource;
}

export function getConfigBlockDataProviders(): Readonly<Record<string, ChaiBlockDataProvider>> {
  return activeConfig.blockDataProviders;
}

export function getConfigBlockDataProvider(type: string): ChaiBlockDataProvider | undefined {
  return activeConfig.blockDataProviders[type];
}

export function getConfigRoles(): ChaiRolesConfig | undefined {
  return activeConfig.roles;
}

/** Plugin-contributed default-role grants, applied on the DEFAULT_ROLE_MAPS fallback only. */
export function getConfigDefaultRoleGrants(): ChaiDefaultRoleGrants {
  return activeConfig.defaultRoleGrants;
}

export function getConfigAI(): ResolvedChaiAiGlobalConfig {
  return activeConfig.ai;
}

export function getConfigMediaManager(): ChaiMediaManagerConfig {
  return activeConfig.mediaManager;
}

export function getConfigActions(): Readonly<Record<string, ResolvedChaiBuilderServerConfig["actions"][string]>> {
  return activeConfig.actions;
}

export function getConfigAction(name: string): ResolvedChaiBuilderServerConfig["actions"][string] | undefined {
  return activeConfig.actions[name];
}

/** @deprecated Use `getConfigAction` instead */
export function getConfigBuilderActions(): Readonly<
  Record<string, ResolvedChaiBuilderServerConfig["builderActions"][string]>
> {
  return getConfigActions();
}

/** @deprecated Use `getConfigAction` instead */
export function getConfigBuilderAction(
  name: string,
): ResolvedChaiBuilderServerConfig["builderActions"][string] | undefined {
  return getConfigAction(name);
}

export function updateActiveActions(actions: ResolvedChaiBuilderServerConfig["actions"]): void {
  const mergedActions = {
    ...activeConfig.actions,
    ...actions,
  };
  activeConfig = {
    ...activeConfig,
    actions: mergedActions,
    builderActions: mergedActions,
  };
}

export function updateActiveAiConfig(ai: ResolvedChaiAiGlobalConfig): void {
  activeConfig = { ...activeConfig, ai };
}

/** @deprecated Use `updateActiveActions` instead */
export function updateActiveBuilderActions(builderActions: ResolvedChaiBuilderServerConfig["builderActions"]): void {
  updateActiveActions(builderActions);
}

export function updateActiveTrash(trash: ChaiTrashEntry[]): void {
  activeConfig = { ...activeConfig, trash };
}

export function updateActiveBlockDataProviders(
  blockDataProviders: ResolvedChaiBuilderServerConfig["blockDataProviders"],
): void {
  activeConfig = {
    ...activeConfig,
    blockDataProviders: {
      ...activeConfig.blockDataProviders,
      ...blockDataProviders,
    },
  };
}

/** @internal Reset active config in unit tests. */
export function resetActiveChaiBuilderConfigForTests(overrides: Partial<ResolvedChaiBuilderServerConfig> = {}): void {
  resetChaiDbForTests();
  activeConfig = {
    ...CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG,
    actions: builtinActions,
    builderActions: builtinActions,
    pageTypes: [],
    collections: [],
    chaiCollections: [],
    repeaterData: [],
    trash: [],
    ...overrides,
  };
}

/** Normalize page type entry for legacy ChaiPageType consumers. */
export function toChaiPageType(entry: ChaiPageTypeEntry): ChaiPageType {
  return {
    ...entry,
    hasSlug: entry.partial ? false : (entry.hasSlug ?? true),
  };
}
