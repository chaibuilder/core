import { runInContext } from "~/server/chai-builder/state";
import type { ChaiRequestContext } from "~/types/chaibuilder-config";
import { TEST_APP_ID, TEST_USER_ID } from "./test-app";

export const testRequestContext = (overrides: Partial<ChaiRequestContext> = {}): ChaiRequestContext => ({
  appId: TEST_APP_ID,
  userId: TEST_USER_ID,
  draft: true,
  lang: "en",
  ...overrides,
});

/**
 * Runs `fn` inside a real ChaiBuilder request context (AsyncLocalStorage state), the way the
 * route handler does. Defaults to draft mode, where `withChaiCache` uses the in-memory strategy;
 * pass `{ draft: false }` for published paths (pair with `installMemoryPersistentCache`).
 */
export function withRequestContext<T>(fn: () => T, overrides?: Partial<ChaiRequestContext>): T {
  return runInContext(testRequestContext(overrides), fn);
}
