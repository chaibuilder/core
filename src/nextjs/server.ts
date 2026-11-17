import "~/server/only-server";
// Side effect: registers the Next.js framework adapter (persistent cache + revalidation).
// NOTE: a host that only ever uses `import type` from this entry never evaluates this module, so
// it needs a value import of the entry (`import "<pkg>/nextjs/server";`) to get a real adapter —
// unless an edition entry point it already uses imports the adapter for it, lazily.
import "~/nextjs/register-adapter";

export type {
  ChaiAction,
  ChaiBlockDataProvider,
  ChaiBuilderInstance,
  ChaiBuilderRouteProps,
  ChaiBuilderServerConfigInput,
  ChaiContextResolver,
  ChaiContextResolverArgs,
  ChaiDbColumnNames,
  ChaiDbConfigInput,
  ChaiDbNaming,
  ChaiDbSetup,
  ChaiDbTableNaming,
  ChaiDebugLevel,
  ChaiFullPage,
  ChaiGlobalDataProvider,
  ChaiIncomingRequest,
  ChaiPageMetadata,
  ChaiPageNotFoundArgs,
  ChaiPageNotFoundHandler,
  ChaiPageNotFoundResult,
  ChaiPageTypeDataProvider,
  ChaiPageTypeEntry,
  ChaiPartialPage,
  ChaiRepeaterDataEntry,
  ChaiRepeaterDataField,
  ChaiRepeaterDataFetchArgs,
  ChaiRepeaterFilter,
  ChaiRepeaterOperator,
  ChaiRepeaterQuery,
  ChaiRelationColumnKey,
  ChaiRepeaterSort,
  ChaiRequestContext,
  ChaiSiteSettingsTransform,
  ChaiTrashableEntity,
  ChaiTrashEntry,
  ResolvedChaiAiGlobalConfig,
  ResolvedChaiBuilderServerConfig,
  ResolvedChaiDbConfig,
} from "~/types";
// In-memory query engine for `chaiCollections` sources backed by arrays/APIs
// that can't translate the structured query to their own backend.
export { applyChaiRepeaterQuery } from "~/utils/apply-repeater-query";
export { CHAI_REPEATER_DYNAMIC_VALUES, CHAI_REPEATER_OPERATORS_BY_TYPE } from "~/types/repeater-data";
export { buildChaiBuilderConfig, getChaiBuilderConfigOnInit } from "~/server/build-config";
export type { BuildChaiBuilderConfigOptions } from "~/server/build-config";
export {
  defineChaiServerPlugin,
  mergeChaiDefaultRoleGrants,
  withChaiActionPermission,
  getChaiRequestHeader,
  registerChaiActionHook,
  registerChaiPageVersionSource,
  registerChaiRequestMiddleware,
  registerChaiSiteDomainResolver,
  runChaiActionHooks,
  runChaiRequestMiddleware,
  type ChaiActionHookArgs,
  type ChaiActionHookName,
  type ChaiPageVersion,
  type ChaiPageVersionLoader,
  type ChaiSavedPageSnapshot,
  type ChaiSiteDomainResolver,
  type ChaiSiteDomains,
  type ChaiThemeSnapshot,
} from "~/server/plugin-api";
// MCP tool authoring and registration. The transport itself lives behind the `<pkg>/mcp`
// entry point, which statically imports the optional `@modelcontextprotocol/sdk` peer;
// nothing re-exported here resolves it, so defining tools never requires installing it.
export * from "~/server/mcp/api";
// Option types of the transport; its functions stay on `<pkg>/mcp` (they import the SDK).
export type { ChaiMcpHandlerOptions, ChaiMcpRouteHandlerOptions, ChaiMcpServerInfo } from "~/server/mcp/handler-types";
// Static superset of what an action can require — how the host's permission
// guards and docs surfaces read a payload-aware `requiredPermission`.
export { getDeclaredChaiPermissionKeys, defineChaiPermissionResolver } from "~/server/chai-actions/permission-keys";
export type {
  ChaiRequestMiddleware,
  ChaiRequestMiddlewareArgs,
  ChaiRequestMiddlewareEntry,
  ChaiRequestMiddlewareResult,
  ChaiSchemaFragment,
  ChaiServerPlugin,
  ChaiSetupHook,
} from "~/types/plugin";
export { createChaiBuilder } from "~/server/create-chai-builder";
export type { ChaiBuilderHandle, CreateChaiBuilderOptions } from "~/server/create-chai-builder";
export {
  getRegisteredChaiContextResolver,
  resetChaiContextResolverForTests,
  createStaticChaiContext,
} from "~/server/chai-context-resolver";
export { CHAI_DEFAULT_SERVER_CONFIG, resolveChaiBuilderConfig, resolveChaiDbConfig } from "~/server/defaults";
export { getChaiBuilder } from "~/server/get-chaibuilder";
// Deprecated names, kept for compatibility. See ./server.deprecated.ts.
export * from "~/nextjs/server.deprecated";
export { handleChaiActionRequest } from "~/nextjs/handle-action-request";
// Multipart transport for file-carrying actions; the route picks the parser and
// hands the result to the same `handleHttpAction`.
export {
  isChaiMultipartActionRequest,
  parseChaiMultipartActionBody,
} from "~/server/chai-builder/parse-multipart-action";
export type { ChaiHttpActionBody } from "~/server/chai-builder/handle-http-action";

export type { ChaiDbContext, ChaiDbInstance, ChaiDbResult } from "~/server/chai-actions/db";
export {
  db as chaiDb,
  ensureChaiDbReady,
  getChaiDb,
  getChaiDbDialect,
  registerChaiDb,
  resetChaiDbForTests,
  safeQuery as tryChaiDbQuery,
  schema as chaiSchema,
} from "~/server/chai-actions/db";
export {
  chaiActionsRegistry,
  ChaiBaseAiAction,
  runChaiAction,
  createChaiActionHandler,
  CHAI_LANGUAGES,
  toChaiActionError,
  toChaiActionErrorPayload,
  tryChaiAction,
  type ChaiActionErrorPayload,
  type ChaiActionFailure,
  type ChaiActionResult,
  type ChaiActionSuccess,
} from "~/server/chai-actions/export";
export type { ChaiActionContext, ChaiActionSurface, ChaiUserAccess } from "~/types";
export {
  createChaiStreamingErrorResponse,
  formatChaiStreamingError,
  isChaiMissingTextStream,
} from "~/server/chai-actions/streaming-error-handlers";

export { ActionError as ChaiActionError } from "~/server/chai-actions/action-error";
export { ChaiBaseAction } from "~/server/chai-actions/base-action";
// NOTE: dialect DB factories are intentionally NOT re-exported here. Importing a
// dialect factory from this entry would statically pull its driver (e.g. `better-sqlite3`)
// into every consumer bundle, breaking projects on a different dialect that never
// installed that optional peer. Import per-dialect subpaths instead:
//   <pkg>/db/better-sqlite3 | <pkg>/db/libsql | <pkg>/db/d1 (pro adds <pkg>/db/postgres | <pkg>/db/node-pg)
export {
  CHAI_PERMISSIONS,
  CHAI_PERMISSION_LIST,
  expandChaiGrantMap,
  hasChaiPermission,
  intersectChaiPermissions,
  type ChaiPermission,
} from "~/server/rbac/permissions";
export { getChaiPermissionCatalog } from "~/server/rbac/permission-catalog";
export type { ChaiDefaultRoleGrants } from "~/types/server-config";
export {
  isChaiGlobalSuperAdmin,
  resolveChaiAppUserAccess,
  type ChaiAppUserAccess,
  type ResolveChaiAppUserAccessArgs,
} from "~/server/rbac/app-user-access";
export { getChaiGlobalRoles } from "~/server/rbac/get-role-permissions";
export { resolveChaiPermissions } from "~/server/rbac/resolve-permissions";
export { resolveChaiAppIdByHostname } from "~/server/chai-builder/public/resolve-app-id-by-hostname";

// Deprecated names, kept for compatibility. See ./server.deprecated.ts.
export * from "./server.deprecated";
