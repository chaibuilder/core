import { AsyncLocalStorage } from "async_hooks";
import { cache } from "react";
import { getRegisteredChaiContextResolver, createStaticChaiContext } from "~/server/chai-context-resolver";
import type {
  ChaiBuilderRouteProps,
  ChaiContextResolverArgs,
  ChaiIncomingRequest,
  ChaiRequestContext,
} from "~/types/chaibuilder-config";

type SharedRequestContextState = {
  context: ChaiRequestContext | null;
};

/**
 * Tracks "a context resolver is currently running" across awaits. AsyncLocalStorage (not React
 * `cache`) because the guard must be visible to nested calls made from arbitrary async work the
 * resolver awaits (e.g. Payload auth hooks) — React `cache` is only request-scoped inside an RSC
 * render, and returns a fresh store per call in route handlers.
 */
const resolvingGuard = new AsyncLocalStorage<true>();

const getCachedRequestContextState = cache(
  (): SharedRequestContextState => ({
    context: null,
  }),
);

/** Vitest runs in plain Node; React cache is not request-scoped there. */
let vitestRequestContextState: SharedRequestContextState | null = null;

function getSharedRequestContextState(): SharedRequestContextState {
  if (process.env.VITEST === "true") {
    vitestRequestContextState ??= { context: null };
    return vitestRequestContextState;
  }
  return getCachedRequestContextState();
}

/** @internal Clears per-request shared context between unit tests. */
export function resetSharedChaiRequestContextForTests(): void {
  vitestRequestContextState = null;
  getCachedRequestContextState().context = null;
}

/**
 * Static, Next-free default context. No `next/headers` access — safe in scripts,
 * MCP tools, and any non-request environment.
 */
export async function resolveDefaultChaiContext(overrides?: Partial<ChaiRequestContext>): Promise<ChaiRequestContext> {
  return createStaticChaiContext(overrides);
}

/**
 * Resolves context via the process-registered resolver, merged over the static
 * default. Falls back to the static default when no resolver is registered.
 */
export async function resolveChaiContextViaResolver(args: ChaiContextResolverArgs): Promise<ChaiRequestContext> {
  const resolver = getRegisteredChaiContextResolver();
  const base = createStaticChaiContext();
  if (!resolver) {
    return withRequestContext(base, args.request);
  }
  const resolved = await resolver(args);
  return withNormalizedDelegation(
    withRequestContext(
      {
        ...base,
        ...resolved,
        siteUrl: resolved.siteUrl ?? base.siteUrl,
      },
      args.request,
    ),
  );
}

/**
 * Accepts the deprecated `delegatedScopes` name and keeps both fields in sync, so
 * consumers of either name (including `cb.context`) see the same value.
 */
function withNormalizedDelegation(context: ChaiRequestContext): ChaiRequestContext {
  const delegated = context.delegatedPermissions ?? context.delegatedScopes ?? null;
  if (delegated === null) return context;
  return { ...context, delegatedPermissions: delegated, delegatedScopes: delegated };
}

/** Takes the first value of a possibly comma-joined header. */
function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

/**
 * Enriches the resolved context from the incoming request:
 * - `siteUrl` fallback (absolute origin) from the `Host` header (or the request
 *   URL host) when neither the resolver nor `SITE_URL` supplied one. Stored as a
 *   full `https://host` URL so downstream `new URL(siteUrl)` never throws.
 *   SITE_URL / resolver values always win, so a correctly-configured production
 *   app never relies on this. `X-Forwarded-Host` is deliberately NOT used: it is
 *   client-settable and would let a request spoof the site origin (e.g. to
 *   `localhost`).
 * - `requestHeaders`, a read-only accessor plugins reach through
 *   `getChaiRequestHeader()` (client hints such as refresh throttles).
 */
function withRequestContext(context: ChaiRequestContext, request?: ChaiIncomingRequest): ChaiRequestContext {
  if (!request) return context;

  let siteUrl = context.siteUrl;
  if (!siteUrl) {
    const host = firstHeaderValue(request.headers.get("host")) ?? hostFromUrl(request.url);
    if (host) siteUrl = `https://${host}`;
  }

  return {
    ...context,
    siteUrl,
    requestHeaders: request.headers,
  };
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Marks the start of a new React request generation so shared context from a
 * prior request is not reused. Called from `getChaiBuilder` (memoized via `cache`).
 */
export const beginChaiRequestContextGeneration = cache((): void => {
  if (process.env.VITEST === "true") {
    return;
  }
  getSharedRequestContextState().context = null;
});

/**
 * Resolves Chai request context once per React request and reuses it for every
 * `getChaiBuilder` call. Route props (when provided) take precedence and update
 * the shared context so child Server Components can call `getChaiBuilder(config)`.
 */
export async function resolveSharedChaiContext(
  routeProps?: ChaiBuilderRouteProps,
  request?: ChaiIncomingRequest,
): Promise<ChaiRequestContext> {
  const state = getSharedRequestContextState();

  // Re-entrancy guard: a host context resolver can transitively call `getChaiBuilder()` again —
  // e.g. Payload auth runs collection/field hooks, and a hook that calls `getChaiBuilder()`
  // re-enters here while the outer resolve is still in flight (shared context not yet stored).
  // Without the guard the nested call runs the resolver again, which re-runs auth, which
  // re-runs the hook — an unbounded async loop that hangs the request with no error.
  // The nested call gets the static default (unauthenticated) context instead; it is not
  // cached, so the outer resolve still stores the real context when it completes.
  if (resolvingGuard.getStore()) {
    return createStaticChaiContext();
  }

  if (routeProps !== undefined) {
    if (!getRegisteredChaiContextResolver()) {
      throw new Error(
        "ChaiBuilder: route props require a context resolver. Create the server handle with `createChaiBuilder(config, { context })` and call the `getChaiBuilder` it returns, or call `getChaiBuilder(config)` without route props.",
      );
    }
    const ctx = await resolvingGuard.run(true, () => resolveChaiContextViaResolver({ routeProps, request }));
    state.context = ctx;
    return ctx;
  }

  if (state.context) {
    return state.context;
  }

  const ctx = getRegisteredChaiContextResolver()
    ? await resolvingGuard.run(true, () => resolveChaiContextViaResolver({}))
    : createStaticChaiContext();
  state.context = ctx;
  return ctx;
}
