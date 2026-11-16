import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.test", override: true });

// Tests build their schema in memory (src/tests/setup/apply-schema.ts); this config only backs
// `db:test:generate` / `db:test:studio` for inspecting the schema by hand.
const url = process.env.TEST_DATABASE_URL || "file:./.tmp/chaibuilder_test.sqlite";

export default defineConfig({
  // Edition-specific schema barrel (core tables only in @chaibuilder/core, the full union in chaipro).
  schema: "./src/edition/test-schema.ts",
  out: "./src/drizzle/migrations-sqlite",
  dialect: "sqlite",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
