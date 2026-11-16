import { editionTestServerPlugins } from "~/edition/test-harness";
import { getAllRegisteredChaiBlocks } from "~/registry/v2/runtime/core";
import type { ChaiDbSetup } from "~/db/core";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { resetChaiBuilderCoreForTests } from "~/server/get-chaibuilder";
import { resetChaiContextResolverForTests, setChaiContextResolver } from "~/server/chai-context-resolver";
import { getActiveChaiBuilderConfig, setActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import type { ChaiBuilderServerConfigInput, ResolvedChaiBuilderServerConfig } from "~/server/defaults/types";
import {
  registerChaiRequestMiddleware,
  resetChaiRequestMiddlewareForTests,
} from "~/server/plugin-api/request-middleware";
import { registerHarnessAfterEach } from "./after-each-hooks";
import { getTestDbSetup, registerTestDb } from "./test-db";

/** Block registry entries as they were before a test's config wrote `dataProvider`s into them. */
const blockEntriesBeforeConfig = new Map<string, unknown>();

/**
 * Builds the real ChaiBuilder server config — edition plugins included — over the test database,
 * exactly like a host app does, and makes it active. Pass config input (pageTypes, chaiCollections,
 * roles, ai, blockDataProviders, extra plugins…) to exercise code paths that read it. `db` swaps
 * the worker database for another setup (e.g. one built under a custom table naming) until the
 * harness restores the worker database after the test.
 */
export function useTestChaiConfig(input: Partial<ChaiBuilderServerConfigInput> & { db?: ChaiDbSetup } = {}) {
  const registry = getAllRegisteredChaiBlocks() as Record<string, unknown>;
  const before = { ...registry };
  const config = buildChaiBuilderConfig({
    ...input,
    db: input.db ?? getTestDbSetup(),
    plugins: [...editionTestServerPlugins(), ...(input.plugins ?? [])],
  });
  for (const type of Object.keys(config.blockDataProviders)) {
    if (!blockEntriesBeforeConfig.has(type)) blockEntriesBeforeConfig.set(type, before[type]);
  }
  return config;
}

/**
 * Layers already-resolved values over the active config without re-running plugins. Use for
 * values that are awkward to express as config input (e.g. a single feature flag or a
 * `resolveDynamicTemplateTie` function).
 */
export function withChaiConfig(overrides: Partial<ResolvedChaiBuilderServerConfig>): void {
  setActiveChaiBuilderConfig({ ...getActiveChaiBuilderConfig(), ...overrides });
  registerTestDb();
}

// Importing this module (directly or through withTestDB) makes the full edition config the
// baseline for the test file: built once here, restored after every test.
const baseConfig = useTestChaiConfig();
blockEntriesBeforeConfig.clear();

/** Undoes the process-global runtime a test's `useTestChaiConfig` registered beyond the baseline. */
function restoreBaseRuntime(): void {
  const registry = getAllRegisteredChaiBlocks() as Record<string, unknown>;
  for (const [type, entry] of blockEntriesBeforeConfig) {
    if (entry === undefined) delete registry[type];
    else registry[type] = entry;
  }
  blockEntriesBeforeConfig.clear();

  resetChaiContextResolverForTests();
  if (baseConfig.contextResolver) setChaiContextResolver(baseConfig.contextResolver);
  resetChaiRequestMiddlewareForTests();
  for (const { name, handler } of baseConfig.requestMiddlewares) registerChaiRequestMiddleware(name, handler);
}

registerHarnessAfterEach(() => {
  registerTestDb();
  setActiveChaiBuilderConfig(baseConfig);
  // `getChaiBuilder` caches its core on first use; a test that built one over a swapped db or
  // config must not hand it to the next test.
  resetChaiBuilderCoreForTests();
  restoreBaseRuntime();
});
