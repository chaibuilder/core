import type { ChaiBaseAction } from "~/server/chai-actions/base-action";
// Side effect: activates the full edition config (plugins) for any file using withTestDB.
import "./chai-config";
import type { ChaiActionContext, ChaiRequestContext } from "~/types";
import { withRequestContext } from "./request-context";
import { createSeeder } from "./seed-api";
import { TEST_APP_ID, TEST_USER_ID } from "./test-app";
import { getTestDb, type TestDb } from "./test-db";

type ActionConstructor<T extends ChaiBaseAction<any, any>> = new () => T;

interface WithTestDBContext {
  db: TestDb;
  seed: ReturnType<typeof createSeeder>["seed"];
  seedMany: ReturnType<typeof createSeeder>["seedMany"];
  seedUpdate: ReturnType<typeof createSeeder>["seedUpdate"];
  /** An action instance bound to the test app and user (override either per call). */
  action: <T extends ChaiBaseAction<any, any>>(
    ActionClass: ActionConstructor<T>,
    contextOverride?: Partial<ChaiActionContext>,
  ) => T;
  /** Runs `fn` inside a real request context for the test app. */
  inRequest: <T>(fn: () => T, overrides?: Partial<ChaiRequestContext>) => T;
}

/**
 * Seeders and action helpers over the real test database and the active ChaiBuilder config.
 * Rows are wiped after every test by the harness, so nothing needs manual cleanup.
 */
export async function withTestDB<T>(testFn: (ctx: WithTestDBContext) => Promise<T>): Promise<T> {
  const db = getTestDb();
  const { seed, seedMany, seedUpdate } = createSeeder(db);

  const action = <A extends ChaiBaseAction<any, any>>(
    ActionClass: ActionConstructor<A>,
    contextOverride: Partial<ChaiActionContext> = {},
  ): A => {
    const instance = new ActionClass();
    instance.setContext({ appId: TEST_APP_ID, userId: TEST_USER_ID, ...contextOverride });
    return instance;
  };

  return testFn({ db, seed, seedMany, seedUpdate, action, inRequest: withRequestContext });
}
