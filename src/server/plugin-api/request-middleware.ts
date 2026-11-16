import type { ChaiRequestMiddleware, ChaiRequestMiddlewareArgs, ChaiRequestMiddlewareResult } from "~/types/plugin";

/**
 * Process-global request middleware registry, keyed by plugin name so repeated
 * registration (Next.js builds a module graph per route) replaces rather than
 * duplicates. Stored on `globalThis` for the same reason as the context
 * resolver (see `server/chai-context-resolver.ts`).
 */
const _g = globalThis as typeof globalThis & {
  __chaiRequestMiddleware?: Map<string, ChaiRequestMiddleware>;
};

function getRegistry(): Map<string, ChaiRequestMiddleware> {
  if (!_g.__chaiRequestMiddleware) {
    _g.__chaiRequestMiddleware = new Map();
  }
  return _g.__chaiRequestMiddleware;
}

export function registerChaiRequestMiddleware(name: string, middleware: ChaiRequestMiddleware): void {
  getRegistry().set(name, middleware);
}

/**
 * Runs registered middleware in REVERSE registration order and returns the
 * first non-null result: the pro presets register before caller plugins, so
 * later (caller) middleware overrides earlier defaults — consistent with how
 * plugin config merging resolves. A middleware that throws fails the request:
 * it could not say whether this path redirects, and falling through to the
 * 404 flow would let the route cache keep a 404 for a path that may resolve.
 * A thrown error is a 500 that the next request retries.
 */
export async function runChaiRequestMiddleware(
  args: ChaiRequestMiddlewareArgs,
): Promise<ChaiRequestMiddlewareResult> {
  for (const [name, middleware] of [...getRegistry()].reverse()) {
    try {
      const result = await middleware(args);
      if (result) {
        return result;
      }
    } catch (error) {
      console.error(`ChaiBuilder: request middleware "${name}" failed:`, { slug: args.slug, error });
      throw error;
    }
  }
  return null;
}

/** @internal Clears registered middleware between unit tests. */
export function resetChaiRequestMiddlewareForTests(): void {
  _g.__chaiRequestMiddleware = undefined;
}
