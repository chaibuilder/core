/**
 * Deprecated names of `<pkg>/nextjs/server`, re-exported by `./server.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */
import "~/server/only-server";
import { registerChaiContextResolver } from "~/server/chai-context-resolver";
import type { ChaiContextResolver } from "~/types/chaibuilder-config";

export type { ChaiCollectionEntry, ChaiRequestContextArgs, ChaiRequestContextResolver } from "~/types/deprecated";

/**
 * Registers the process-wide context resolver. The last call wins.
 *
 * @deprecated Pass `context` to `createChaiBuilder(config, { context })` from `<pkg>/nextjs/server`,
 * which registers the resolver and hands back a `getChaiBuilder` bound to the config — so entry
 * points import that instead of relying on a side-effect import that is easy to forget. Kept for
 * compatibility.
 */
export function setChaiContextResolver(resolver: ChaiContextResolver): void {
  registerChaiContextResolver(resolver);
}

export {
  /** @deprecated Use `ChaiActionError` from `<pkg>/nextjs/server`. Kept for compatibility. */
  ActionError,
} from "~/server/chai-actions/action-error";

export {
  /**
   * @deprecated Use `chaiActionsRegistry` from `<pkg>/nextjs/server` — or, better, `actions` in
   * `buildChaiBuilderConfig` or a server plugin over runtime registration. Kept for compatibility.
   */
  default as BuilderActionsRegistry,
  /** @deprecated Use `chaiActionsRegistry` from `<pkg>/nextjs/server`. Kept for compatibility. */
  default as ChaiActionsRegistry,
} from "~/server/chai-actions/actions-registery";

export {
  /** @deprecated Use `chaiDb` from `<pkg>/nextjs/server`. Kept for compatibility. */
  db,
  /** @deprecated Use `ChaiDbInstance` from `<pkg>/nextjs/server`. Kept for compatibility. */
  type ChaiDbInstance as DbInstance,
  /** @deprecated Use `ChaiDbResult` from `<pkg>/nextjs/server`. Kept for compatibility. */
  type ChaiDbResult as DbResult,
  /** @deprecated Use `ensureChaiDbReady` from `<pkg>/nextjs/server`. Kept for compatibility. */
  ensureChaiDbReady as ensureDbReady,
  /** @deprecated Use `getChaiDb` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getChaiDb as getDb,
  /** @deprecated Use `getChaiDbDialect` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getChaiDbDialect as getDbDialect,
  /** @deprecated Use `registerChaiDb` from `<pkg>/nextjs/server`. Kept for compatibility. */
  registerChaiDb as registerDb,
  /** @deprecated Use `resetChaiDbForTests` from `<pkg>/nextjs/server`. Kept for compatibility. */
  resetChaiDbForTests as resetDbForTests,
  /** @deprecated Use `tryChaiDbQuery` from `<pkg>/nextjs/server`. Kept for compatibility. */
  safeQuery,
  /** @deprecated Use `chaiSchema` from `<pkg>/nextjs/server`. Kept for compatibility. */
  schema,
} from "~/server/chai-actions/db";

export {
  /** @deprecated Use `ChaiBaseAiAction` from `<pkg>/nextjs/server`. Kept for compatibility. */
  ChaiBaseAiAction as ChaiBaseAIAction,
  /** @deprecated Use `runChaiAction` from `<pkg>/nextjs/server`. Kept for compatibility. */
  runChaiAction as dispatchChaiAction,
  /** @deprecated Use `createChaiActionHandler` from `<pkg>/nextjs/server`. Kept for compatibility. */
  createChaiActionHandler as initChaiActionHandler,
  /** @deprecated Use `createChaiActionHandler` from `<pkg>/nextjs/server`. Kept for compatibility. */
  createChaiActionHandler as initChaiBuilderActionHandler,
  /** @deprecated Use `CHAI_LANGUAGES` from `<pkg>/nextjs/server`. Kept for compatibility. */
  CHAI_LANGUAGES as LANGUAGES,
  /** @deprecated Use `toChaiActionError` from `<pkg>/nextjs/server`. Kept for compatibility. */
  toChaiActionError as toActionError,
  /** @deprecated Use `toChaiActionErrorPayload` from `<pkg>/nextjs/server`. Kept for compatibility. */
  toChaiActionErrorPayload as toActionErrorPayload,
} from "~/server/chai-actions/export";

export {
  /** @deprecated Use `getDeclaredChaiPermissionKeys` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getDeclaredChaiPermissionKeys as declaredPermissionKeysOf,
  /** @deprecated Use `defineChaiPermissionResolver` from `<pkg>/nextjs/server`. Kept for compatibility. */
  defineChaiPermissionResolver as permissionResolver,
} from "~/server/chai-actions/permission-keys";

export {
  /** @deprecated Use `createChaiStreamingErrorResponse` from `<pkg>/nextjs/server`. Kept for compatibility. */
  createChaiStreamingErrorResponse as createStreamingErrorResponse,
  /** @deprecated Use `formatChaiStreamingError` from `<pkg>/nextjs/server`. Kept for compatibility. */
  formatChaiStreamingError as formatStreamingError,
  /** @deprecated Use `isChaiMissingTextStream` from `<pkg>/nextjs/server`. Kept for compatibility. */
  isChaiMissingTextStream as isMissingTextStream,
} from "~/server/chai-actions/streaming-error-handlers";

export {
  /** @deprecated Use `ChaiHttpActionBody` from `<pkg>/nextjs/server`. Kept for compatibility. */
  type ChaiHttpActionBody as HttpChaiActionBody,
} from "~/server/chai-builder/handle-http-action";

export {
  /** @deprecated Use `isChaiMultipartActionRequest` from `<pkg>/nextjs/server`. Kept for compatibility. */
  isChaiMultipartActionRequest as isMultipartActionRequest,
  /** @deprecated Use `parseChaiMultipartActionBody` from `<pkg>/nextjs/server`. Kept for compatibility. */
  parseChaiMultipartActionBody as parseMultipartActionBody,
} from "~/server/chai-builder/parse-multipart-action";

export {
  /** @deprecated Use `resolveChaiAppIdByHostname` from `<pkg>/nextjs/server`. Kept for compatibility. */
  resolveChaiAppIdByHostname as resolveAppIdByHostname,
} from "~/server/chai-builder/public/resolve-app-id-by-hostname";

export {
  /** @deprecated Use `getRegisteredChaiContextResolver` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getRegisteredChaiContextResolver as getChaiContextResolver,
  /** @deprecated Use `createStaticChaiContext` from `<pkg>/nextjs/server`. Kept for compatibility. */
  createStaticChaiContext as staticDefaultChaiContext,
} from "~/server/chai-context-resolver";

export {
  /** @deprecated Use `CHAI_DEFAULT_SERVER_CONFIG` from `<pkg>/nextjs/server`. Kept for compatibility. */
  CHAI_DEFAULT_SERVER_CONFIG as DEFAULT_CHAI_BUILDER_SERVER_CONFIG,
  /** @deprecated Use `resolveChaiDbConfig` from `<pkg>/nextjs/server`. Kept for compatibility. */
  resolveChaiDbConfig as resolveDbConfig,
} from "~/server/defaults";

export {
  /** @deprecated Use `getRegisteredChaiMcpInstructions` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getRegisteredChaiMcpInstructions as getChaiMcpInstructionsSections,
  /** @deprecated Use `getRegisteredChaiMcpTool` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getRegisteredChaiMcpTool as getChaiMcpTool,
  /** @deprecated Use `getRegisteredChaiMcpTools` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getRegisteredChaiMcpTools as getChaiMcpTools,
  /** @deprecated Use `getMissingChaiMcpToolPermissions` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getMissingChaiMcpToolPermissions as missingChaiMcpToolPermissions,
} from "~/server/mcp/api";

export {
  /** @deprecated Use `mergeChaiDefaultRoleGrants` from `<pkg>/nextjs/server`. Kept for compatibility. */
  mergeChaiDefaultRoleGrants as mergeDefaultRoleGrants,
  /** @deprecated Use `withChaiActionPermission` from `<pkg>/nextjs/server`. Kept for compatibility. */
  withChaiActionPermission as withActionPermission,
} from "~/server/plugin-api";

export {
  /** @deprecated Use `getChaiGlobalRoles` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getChaiGlobalRoles as getGlobalRoles,
} from "~/server/rbac/get-role-permissions";

export {
  /** @deprecated Use `getChaiPermissionCatalog` from `<pkg>/nextjs/server`. Kept for compatibility. */
  getChaiPermissionCatalog as getPermissionCatalog,
} from "~/server/rbac/permission-catalog";

export {
  /** @deprecated Use `expandChaiGrantMap` from `<pkg>/nextjs/server`. Kept for compatibility. */
  expandChaiGrantMap as expandGrantMap,
  /** @deprecated Use `hasChaiPermission` from `<pkg>/nextjs/server`. Kept for compatibility. */
  hasChaiPermission as hasPermission,
  /** @deprecated Use `intersectChaiPermissions` from `<pkg>/nextjs/server`. Kept for compatibility. */
  intersectChaiPermissions as intersectPermissions,
} from "~/server/rbac/permissions";

export {
  /** @deprecated Use `resolveChaiPermissions` from `<pkg>/nextjs/server`. Kept for compatibility. */
  resolveChaiPermissions as resolvePermissions,
} from "~/server/rbac/resolve-permissions";

export {
  /** @deprecated Use `ChaiRepeaterDataFetchArgs` from `<pkg>/nextjs/server`. Kept for compatibility. */
  type ChaiRepeaterDataFetchArgs as ChaiRepeaterDataFetchParams,
  /** @deprecated Use `ResolvedChaiAiGlobalConfig` from `<pkg>/nextjs/server`. Kept for compatibility. */
  type ResolvedChaiAiGlobalConfig as ResolvedChaiAIGlobalConfig,
} from "~/types";

export {
  /** @deprecated Use `applyChaiRepeaterQuery` from `<pkg>/nextjs/server`. Kept for compatibility. */
  applyChaiRepeaterQuery as applyRepeaterQuery,
} from "~/utils/apply-repeater-query";
