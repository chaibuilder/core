import { afterEach } from "vitest";
import { resetFrameworkAdapterForTests } from "~/server/framework-adapter";
import { runHarnessAfterEach } from "./after-each-hooks";
import { applyTestSchema } from "./apply-schema";
import { resetTestData } from "./reset";
import { seedTestApp } from "./test-app";
import { getTestDb, getTestSqlite, registerTestDb } from "./test-db";

// Node-environment test files run against a real in-memory SQLite database with the full edition
// schema and the test app seeded, registered as ChaiBuilder's `db`. Files that import
// `~/tests/setup/chai-config` or `~/tests/setup/transaction-manager` also get the real ChaiBuilder
// config with the edition plugins (kept out of other files: building it costs ~1.5s per file).
applyTestSchema(getTestSqlite());
await seedTestApp(getTestDb());
registerTestDb();

afterEach(async () => {
  resetFrameworkAdapterForTests();
  await resetTestData(getTestDb());
  // A test may have swapped config, a stub db, or reset the singletons; the next test starts clean.
  registerTestDb();
  await runHarnessAfterEach();
});
