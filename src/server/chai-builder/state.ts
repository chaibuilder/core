import { AsyncLocalStorage } from "async_hooks";
import type { ChaiActionSurface } from "~/types/chai-action";
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
  /** Surface the request came through, as stated by the context resolver; null when unstated. */
  surface: ChaiActionSurface | null;
  cacheKeys: Map<string, true>;
  traceId: string | null;
  traceStart: number;
  traceLabel: string | null;
  traceDetail: string | null;
  traceDepth: number;
};

// On `globalThis`, so every copy of this module shares one store. Next.js builds a module graph per
// route, and the plugin registries (request middleware, action hooks) are process-global: a handler
// registered from another graph still runs with this request's state.
const STORAGE_KEY = Symbol.for("chaibuilder.requestState");
const _g = globalThis as typeof globalThis & { [STORAGE_KEY]?: AsyncLocalStorage<RequestState> };
const storage = (_g[STORAGE_KEY] ??= new AsyncLocalStorage<RequestState>());

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
  surface: null,
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
  // Never a literal: `getFallbackLang` seeds it from site settings on first read.
  state.fallbackLang = null;
  state.requestHeaders = ctx.requestHeaders ?? null;
  // `delegatedScopes` is the deprecated name for the same ceiling.
  state.delegatedPermissions = ctx.delegatedPermissions ?? ctx.delegatedScopes ?? null;
  state.surface = ctx.surface ?? null;
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

/**
 * @internal Like {@link runInContext}, but always starts a new store.
 *
 * `runInContext` reuses an outer store for the same app, which is what keeps nested
 * bound instance calls on one request state. A transport that *derives* a context from
 * the resolved one — the MCP handler stamping `surface` and a delegation ceiling — must
 * not be silently collapsed into the outer state that lacks them, so it opts out.
 */
export function runInFreshContext<T>(context: ChaiRequestContext, fn: () => T): T {
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
