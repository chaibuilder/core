import type { ChaiContextResolver, ChaiRequestContext } from "~/types/chaibuilder-config";

/**
 * Process-global context resolver. ChaiBuilder is configured for one context per
 * process: `createChaiBuilder(config, { context })` registers a single resolver here
 * and every `getChaiBuilder` call delegates to it. Decoupled from the server config so
 * the config stays environment-agnostic (importable in scripts/MCP without Next).
 *
 * Stored on `globalThis` so it is shared across all module instances within the
 * same Node.js process (Next.js App Router creates per-route module graphs that
 * would otherwise each receive a separate, uninitialised copy of this variable).
 */
const _g = globalThis as typeof globalThis & { __chaiContextResolver?: ChaiContextResolver };

/**
 * Registers the process-wide context resolver. The last call wins. Internal: hosts pass
 * `context` to `createChaiBuilder(config, { context })`, which calls this.
 */
export function registerChaiContextResolver(resolver: ChaiContextResolver): void {
  _g.__chaiContextResolver = resolver;
}

/** Returns the registered resolver, or `null` if none has been set. */
export function getRegisteredChaiContextResolver(): ChaiContextResolver | null {
  return _g.__chaiContextResolver ?? null;
}

/** @internal Clears the registered resolver between unit tests. */
export function resetChaiContextResolverForTests(): void {
  _g.__chaiContextResolver = undefined;
}

/**
 * Static, Next-free context used when no resolver is registered (e.g. scripts,
 * seeding). Reads identity from env only — never touches `next/headers`.
 */
export function createStaticChaiContext(overrides?: Partial<ChaiRequestContext>): ChaiRequestContext {
  return {
    appId: process.env.CHAIBUILDER_API_KEY ?? process.env.CHAIBUILDER_APP_KEY ?? "",
    siteUrl: process.env.SITE_URL ?? null,
    draft: false,
    userId: null,
    lang: "en",
    ...overrides,
  };
}
