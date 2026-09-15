import { AsyncLocalStorage } from "async_hooks";
import type { ChaiRequestContext } from "~/types/chaibuilder-config";
import { getGlobalDebugLevel, runWithDebugLevel } from "../debug/debug-level";

export type RequestState = {
  appId: string | null;
  userId: string | null;
  /** Role label from context; only meaningful alongside `permissions`. */
  role: string | null;
  /** Host-supplied permission grants; null means "resolve membership from app_users". */
  permissions: string[] | null;
  draftMode: boolean;
  /** Site default language. `null` until seeded from site settings — see `getFallbackLang`. */
  fallbackLang: string | null;
  lang: string | null;
  initialized: boolean;
  siteUrl: string | null;
  /** Incoming request headers accessor for plugins; null outside an HTTP request. */
  requestHeaders: { get(name: string): string | null } | null;
  /** Delegation ceiling for this credential (OAuth/MCP); null on normal browser requests. */
  delegatedPermissions: string[] | null;
  cacheKeys: Map<string, true>;
  traceId: string | null;
  traceStart: number;
  traceLabel: string | null;
  traceDetail: string | null;
  traceDepth: number;
};

const storage = new AsyncLocalStorage<RequestState>();

const createDefaultState = (): RequestState => ({
  appId: null,
  userId: null,
  role: null,
  permissions: null,
  draftMode: false,
  fallbackLang: null,
  lang: null,
  initialized: false,
  siteUrl: null,
  requestHeaders: null,
  delegatedPermissions: null,
  cacheKeys: new Map(),
  traceId: null,
  traceStart: 0,
  traceLabel: null,
  traceDetail: null,
  traceDepth: 0,
});

function applyContext(state: RequestState, ctx: ChaiRequestContext): void {
  state.appId = ctx.appId;
  state.userId = ctx.userId ?? null;
  state.role = ctx.role ?? null;
  state.permissions = ctx.permissions ?? null;
  state.draftMode = ctx.draft ?? false;
  state.siteUrl = ctx.siteUrl ?? null;
  state.lang = ctx.lang ?? "en";
  state.fallbackLang = "en";
  state.requestHeaders = ctx.requestHeaders ?? null;
  // `delegatedScopes` is the deprecated name for the same ceiling.
  state.delegatedPermissions = ctx.delegatedPermissions ?? ctx.delegatedScopes ?? null;
  state.initialized = true;
  state.cacheKeys.clear();
  state.traceId = null;
  state.traceStart = 0;
  state.traceLabel = null;
  state.traceDetail = null;
  state.traceDepth = 0;
}

/** @internal Legacy bridge — used by bound instance methods and ChaiBuilder.with() */
export const getRequestState = (): RequestState => {
  const store = storage.getStore();
  if (store) return store;
  throw new Error("ChaiBuilder method called outside of a request context");
};

/** @internal Optional request state for debug instrumentation */
export const getOptionalRequestState = (): RequestState | undefined => {
  return storage.getStore();
};

/** @internal Runs fn with legacy request state populated from explicit context */
export function runInContext<T>(context: ChaiRequestContext, fn: () => T): T {
  const existing = storage.getStore();
  if (existing?.initialized && existing.appId === context.appId) {
    return runWithDebugLevel(getGlobalDebugLevel(), fn);
  }

  return storage.run(createDefaultState(), () => {
    applyContext(getRequestState(), context);
    return runWithDebugLevel(getGlobalDebugLevel(), fn);
  });
}

/** @internal Restores request state when callbacks run outside ALS (e.g. persistent cache) */
export function runWithOptionalRequestState<T>(state: RequestState | undefined, fn: () => T): T {
  if (!state) {
    return fn();
  }
  return storage.run(state, fn);
}

/** @internal Legacy bridge for ChaiBuilder.with() / ChaiBuilder.withUser() */
export const runWithState = <T>(fn: () => T): T => {
  return storage.run(createDefaultState(), fn);
};

export const getInitializedState = (): RequestState => {
  const state = getRequestState();
  if (!state.initialized || !state.appId) {
    throw new Error("Please initialize ChaiBuilder with an API key");
  }
  return state;
};

export const getInitializedStateWithUser = (): RequestState & { appId: string; userId: string } => {
  const state = getRequestState();
  if (!state.initialized || !state.appId) {
    throw new Error("Please initialize ChaiBuilder with an API key");
  }
  if (!state.userId) {
    throw new Error("Please initialize ChaiBuilder with initWithUser() for this operation");
  }
  return state as RequestState & { appId: string; userId: string };
};

// Backward compatibility aliases
export const verifyInit = getInitializedState;
export const verifyInitWithUser = getInitializedStateWithUser;
