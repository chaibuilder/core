import "~/server/only-server";
import { getDeclaredChaiPermissionKeys } from "~/server/chai-actions/permission-keys";
import type { ChaiAction, ChaiRequiredPermission } from "~/types/chai-action";
import type { ChaiServerPlugin } from "~/types/plugin";
import type {
  ChaiBuilderServerConfigInput,
  ChaiDefaultRoleGrants,
  ChaiPluginFeatures,
  ChaiMediaManagerConfig,
  ChaiServerFeaturesInput,
  ChaiMediaManagerConfigInput,
} from "~/types/server-config";

/** Typed plugin definition helper. `meta.name` becomes the plugin's stable id (`pluginName`). */
export const defineChaiServerPlugin = (plugin: ChaiServerPlugin, meta?: { name?: string }): ChaiServerPlugin => {
  if (meta?.name) plugin.pluginName = meta.name;
  return plugin;
};

/**
 * Sets plugin-owned feature keys on the config being built. Plugin-owned keys
 * are excluded from the app `features` input type, so plugins set them through
 * this helper; the plugin's value wins over anything already present.
 */
export function setPluginFeatures(
  config: ChaiBuilderServerConfigInput,
  features: Partial<ChaiPluginFeatures>,
): ChaiBuilderServerConfigInput {
  return { ...config, features: { ...config.features, ...features } as ChaiServerFeaturesInput };
}

/**
 * Same as {@link setPluginFeatures}, for media manager config set by a plugin —
 * plugin-owned tab keys, plus core keys a media backend owns the value for
 * (`uploads`). The plugin's value wins over anything already present.
 */
export function setPluginMediaManager(
  config: ChaiBuilderServerConfigInput,
  mediaManager: Partial<ChaiMediaManagerConfig>,
): ChaiBuilderServerConfigInput {
  return {
    ...config,
    mediaManager: { ...config.mediaManager, ...mediaManager } as ChaiMediaManagerConfigInput,
  };
}

/**
 * Assigns `requiredPermission` on an action instance and returns it (same as core's
 * `wp`). Also records `declaredPermissionKeys`; a payload-aware resolver must be
 * built with `defineChaiPermissionResolver()` or this throws.
 */
export function withChaiActionPermission<T extends ChaiAction<any, any>>(
  action: T,
  permission: ChaiRequiredPermission<any>,
): T {
  action.requiredPermission = permission;
  action.declaredPermissionKeys = getDeclaredChaiPermissionKeys(permission);
  return action;
}

/**
 * Unions two `defaultRoleGrants` maps per role (order-independent, deduped).
 * Plugins use this in their reducer to append grants without clobbering what
 * earlier plugins or the app contributed:
 *
 * ```ts
 * defaultRoleGrants: mergeDefaultRoleGrants(config.defaultRoleGrants, { editor: ["widgets:*"] }),
 * ```
 */
export function mergeChaiDefaultRoleGrants(
  a: ChaiDefaultRoleGrants = {},
  b: ChaiDefaultRoleGrants,
): ChaiDefaultRoleGrants {
  const out: ChaiDefaultRoleGrants = { ...a };
  for (const [role, keys] of Object.entries(b)) {
    out[role] = [...new Set([...(out[role] ?? []), ...keys])];
  }
  return out;
}

export {
  getContributedChaiPermissions,
  registerChaiPermissions,
  resetChaiPermissionsForTests,
} from "./permission-registry";
export {
  getContributedChaiInstanceApis,
  registerChaiInstanceApi,
  resetChaiInstanceApisForTests,
  type ChaiInstanceApi,
} from "./instance-api-registry";
export {
  registerChaiActionHook,
  resetChaiActionHooksForTests,
  runChaiActionHooks,
  type ChaiActionHookArgs,
  type ChaiActionHookName,
  type ChaiSavedPageSnapshot,
  type ChaiThemeSnapshot,
} from "./action-hooks";
export {
  getChaiPageVersionSource,
  registerChaiPageVersionSource,
  resetChaiPageVersionSourcesForTests,
  type ChaiPageVersion,
  type ChaiPageVersionLoader,
} from "./page-version-sources";
export {
  getChaiSiteDomainResolver,
  registerChaiSiteDomainResolver,
  resetChaiSiteDomainResolverForTests,
  type ChaiSiteDomainResolver,
  type ChaiSiteDomains,
} from "./site-domains";
export { getChaiRequestHeader } from "./request-headers";
// MCP tool/instruction registration. SDK-free: a plugin contributes tools whether or
// not the app installed `@modelcontextprotocol/sdk` and mounted the transport.
export * from "~/server/mcp/api";
export {
  registerChaiRequestMiddleware,
  resetChaiRequestMiddlewareForTests,
  runChaiRequestMiddleware,
} from "./request-middleware";
export type {
  ChaiRequestMiddleware,
  ChaiRequestMiddlewareArgs,
  ChaiRequestMiddlewareEntry,
  ChaiRequestMiddlewareResult,
  ChaiSchemaFragment,
  ChaiServerPlugin,
  ChaiSetupHook,
} from "~/types/plugin";
export type { ChaiDefaultRoleGrants } from "~/types/server-config";
