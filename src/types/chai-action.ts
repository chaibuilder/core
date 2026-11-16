export type ChaiUserAccess = {
  role: string;
  permissions: string[] | null;
};

/**
 * Which surface a request came through, as stated by the host's context resolver.
 * `resolveEditSource` and activity logs prefer it over inferring the caller from
 * `delegatedPermissions` / `role`, which mislabels service contexts.
 */
export type ChaiActionSurface = "builder" | "settings" | "mcp" | "clone" | "inter-site" | "service";

/**
 * Action Context
 * Contains information and repositories needed by actions
 */
export interface ChaiActionContext {
  appId: string;
  userId?: string;
  /**
   * Effective access for this request, set by `dispatchChaiAction` on authenticated actions:
   * host-supplied context permissions or the resolved `app_users` membership, already clamped
   * by {@link delegatedPermissions}. Actions that resolve access themselves should return this
   * when present rather than looking it up again.
   */
  userAccess?: ChaiUserAccess;
  /**
   * Delegation ceiling for the credential making this request (OAuth app, MCP token).
   * Already applied to {@link userAccess}; exposed for actions that need to reason about it.
   * Absent/null on normal browser requests (full user permissions apply).
   */
  delegatedPermissions?: string[] | null;
  /** @deprecated Renamed to {@link delegatedPermissions}; kept populated with the same value. */
  delegatedScopes?: string[] | null;
  /**
   * Surface the request came through, as stated by the host's context resolver.
   * Absent when the resolver did not say — consumers fall back to the
   * `role` / `delegatedPermissions` heuristic (see `resolveEditSource`).
   */
  surface?: ChaiActionSurface | null;
  /** Registry action key, when set by the dispatcher. */
  action?: string;
}

/**
 * Resolves the permission(s) required to run an action: a static key, a list of
 * keys the caller must hold all of, or a function deriving either from the
 * action data/context. `null`/`undefined`/`[]` = authenticated-only.
 */
export type ChaiRequiredPermission<T = any> = string | string[] | ChaiPermissionResolver<T>;

/**
 * The function form of {@link ChaiRequiredPermission}. `declaredPermissionKeys`
 * is the static superset of every key the resolver may return, for audits that
 * inspect permissions without dispatching. Build with `permissionResolver()`
 * (`~/server/chai-actions/permission-keys`) rather than setting it by hand.
 */
export type ChaiPermissionResolver<T = any> = {
  (data: T, context: ChaiActionContext): string | string[] | null | undefined;
  declaredPermissionKeys?: string[];
};

/**
 * ChaiAction Interface
 * Defines the contract for all action handlers
 */
export interface ChaiAction<T = any, K = any> {
  /**
   * Permission required to run this action. Enforced by `dispatchChaiAction`.
   * Undeclared (undefined) = authenticated-only (no specific permission).
   */
  requiredPermission?: ChaiRequiredPermission<T>;
  /**
   * Every permission key {@link requiredPermission} may require, whatever the
   * payload. Set by `withActionPermission`; do not assign it by hand.
   */
  declaredPermissionKeys?: string[];
  validate(data: T): boolean;
  setContext(context: ChaiActionContext): void;
  execute(data: T): Promise<K>;
  run(data: T): Promise<K>;
}
