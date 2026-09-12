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
  ChaiCollectionEntry,
  ChaiContextResolver,
  ChaiContextResolverArgs,
  ChaiDbConfigInput,
  ChaiDbSetup,
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
  ChaiRepeaterDataFetchParams,
  ChaiRepeaterFilter,
  ChaiRepeaterOperator,
  ChaiRepeaterQuery,
  ChaiRepeaterSort,
  ChaiRequestContext,
  ChaiRequestContextArgs,
  ChaiRequestContextResolver,
  ChaiSiteSettingsTransform,
  ChaiTrashableEntity,
  ChaiTrashEntry,
  ResolvedChaiAIGlobalConfig,
  ResolvedChaiBuilderServerConfig,
  ResolvedChaiDbConfig,
} from "~/types";
// In-memory query engine for `chaiCollections` sources backed by arrays/APIs
// that can't translate the structured query to their own backend.
export { applyRepeaterQuery } from "~/utils/apply-repeater-query";
export { CHAI_REPEATER_DYNAMIC_VALUES, CHAI_REPEATER_OPERATORS_BY_TYPE } from "~/types/repeater-data";
export { buildChaiBuilderConfig, getChaiBuilderConfigOnInit } from "~/server/build-config";
export type { BuildChaiBuilderConfigOptions } from "~/server/build-config";
export {
  defineChaiServerPlugin,
  getChaiRequestHeader,
  registerChaiActionHook,
  registerChaiRequestMiddleware,
  runChaiActionHooks,
  runChaiRequestMiddleware,
  type ChaiActionHookArgs,
  type ChaiActionHookName,
} from "~/server/plugin-api";
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
  getChaiContextResolver,
  resetChaiContextResolverForTests,
  setChaiContextResolver,
  staticDefaultChaiContext,
} from "~/server/chai-context-resolver";
export { DEFAULT_CHAI_BUILDER_SERVER_CONFIG, resolveChaiBuilderConfig, resolveDbConfig } from "~/server/defaults";
export { getChaiBuilder } from "~/server/get-chaibuilder";
export { handleChaiActionRequest } from "~/nextjs/handle-action-request";
// Multipart transport for file-carrying actions; the route picks the parser and
// hands the result to the same `handleHttpAction`.
export { isMultipartActionRequest, parseMultipartActionBody } from "~/server/chai-builder/parse-multipart-action";
export type { HttpChaiActionBody } from "~/server/chai-builder/handle-http-action";

export * from "~/server/chai-actions/db";
export {
  BuilderActionsRegistry,
  ChaiActionsRegistry,
  ChaiBaseAIAction,
  dispatchChaiAction,
  initChaiActionHandler,
  initChaiBuilderActionHandler,
  LANGUAGES,
  toActionError,
  toActionErrorPayload,
  tryChaiAction,
  type ChaiActionErrorPayload,
  type ChaiActionFailure,
  type ChaiActionResult,
  type ChaiActionSuccess,
} from "~/server/chai-actions/export";
export type { ChaiActionContext, ChaiUserAccess } from "~/types";
export {
  createStreamingErrorResponse,
  formatStreamingError,
  isMissingTextStream,
} from "~/server/chai-actions/streaming-error-handlers";

export { ActionError } from "~/server/chai-actions/action-error";
export { ChaiBaseAction } from "~/server/chai-actions/base-action";
// NOTE: dialect DB factories are intentionally NOT re-exported here. Importing a
// dialect factory from this entry would statically pull its driver (e.g. `better-sqlite3`)
// into every consumer bundle, breaking projects on a different dialect that never
// installed that optional peer. Import per-dialect subpaths instead:
//   <pkg>/db/better-sqlite3 | <pkg>/db/libsql | <pkg>/db/d1 (pro adds <pkg>/db/postgres | <pkg>/db/node-pg)
export {
  CHAI_PERMISSIONS,
  CHAI_PERMISSION_LIST,
  expandGrantMap,
  hasPermission,
  intersectPermissions,
  type ChaiPermission,
} from "~/server/rbac/permissions";
export { getPermissionCatalog } from "~/server/rbac/permission-catalog";
export type { ChaiDefaultRoleGrants } from "~/types/server-config";
export {
  isChaiGlobalSuperAdmin,
  resolveChaiAppUserAccess,
  type ChaiAppUserAccess,
  type ResolveChaiAppUserAccessArgs,
} from "~/server/rbac/app-user-access";
export { getGlobalRoles } from "~/server/rbac/get-role-permissions";
export { resolvePermissions } from "~/server/rbac/resolve-permissions";
export { resolveAppIdByHostname } from "~/server/chai-builder/public/resolve-app-id-by-hostname";
