import { AsyncLocalStorage } from "node:async_hooks";
import type { ChaiMcpPageContext, ChaiMcpRequestContext, ChaiMcpToolContext } from "~/types/mcp";

/**
 * Per-request and per-tool-call context for MCP handlers.
 *
 * Handlers receive the tool context as their second argument, but helpers several calls
 * deep (the shared page resolver, the lease writer) need it without threading it through
 * every signature — so it also lives in an `AsyncLocalStorage`. Both stores hang off
 * `globalThis` so the CJS build, which inlines shared modules per entry point, still has
 * exactly one of each.
 */

const REQUEST_KEY = Symbol.for("chaibuilder.mcp.requestStore");
const TOOL_KEY = Symbol.for("chaibuilder.mcp.toolStore");

const _g = globalThis as typeof globalThis & {
  [REQUEST_KEY]?: AsyncLocalStorage<ChaiMcpRequestContext>;
  [TOOL_KEY]?: AsyncLocalStorage<ChaiMcpToolContext>;
};

function requestStore(): AsyncLocalStorage<ChaiMcpRequestContext> {
  if (!_g[REQUEST_KEY]) _g[REQUEST_KEY] = new AsyncLocalStorage<ChaiMcpRequestContext>();
  return _g[REQUEST_KEY];
}

function toolStore(): AsyncLocalStorage<ChaiMcpToolContext> {
  if (!_g[TOOL_KEY]) _g[TOOL_KEY] = new AsyncLocalStorage<ChaiMcpToolContext>();
  return _g[TOOL_KEY];
}

export function runWithChaiMcpRequest<T>(context: ChaiMcpRequestContext, fn: () => T): T {
  return requestStore().run(context, fn);
}

export function getChaiMcpRequestContext(): ChaiMcpRequestContext | undefined {
  return requestStore().getStore();
}

/** The request context, or a clear error — for helpers that are MCP-only by construction. */
export function requireChaiMcpRequestContext(): ChaiMcpRequestContext {
  const context = getChaiMcpRequestContext();
  if (!context) {
    throw new Error("ChaiBuilder MCP: no active MCP request. This helper may only be called from an MCP tool handler.");
  }
  return context;
}

/** Scopes a fresh page/detail bag to one tool invocation. */
export function runWithChaiMcpToolContext<T>(toolName: string, fn: (ctx: ChaiMcpToolContext) => T): T {
  const context: ChaiMcpToolContext = { ...requireChaiMcpRequestContext(), toolName, detail: {} };
  return toolStore().run(context, () => fn(context));
}

export function getChaiMcpToolContext(): ChaiMcpToolContext | undefined {
  return toolStore().getStore();
}

/**
 * Record the page a tool is acting on. Called from the shared page resolver, so every
 * page tool contributes this to the audit event without knowing logging exists. Later
 * calls merge into earlier ones.
 */
export function recordChaiMcpPageContext(page: ChaiMcpPageContext): void {
  const store = getChaiMcpToolContext();
  if (!store) return;
  store.page = { ...store.page, ...page };
}

/**
 * Record the real error behind a failure a handler is about to report as a message.
 *
 * Only an exception that escapes the handler reaches the audit hook by itself, and most
 * handlers catch to say something useful about what failed ("Failed to publish X"). This
 * keeps the original for the host's logs; the caller still only sees the safe message.
 * The first error recorded wins — it is the cause, and anything after it is fallout.
 */
export function recordChaiMcpToolError(error: unknown): void {
  const store = getChaiMcpToolContext();
  if (!store || store.error !== undefined) return;
  store.error = error;
}

/** Record extra audit detail for the current tool call. */
export function recordChaiMcpToolDetail(detail: Record<string, unknown>): void {
  const store = getChaiMcpToolContext();
  if (!store) return;
  Object.assign(store.detail, detail);
}
