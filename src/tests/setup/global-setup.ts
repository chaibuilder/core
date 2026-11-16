import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import type { TestProject } from "vitest/node";
import * as schema from "~/edition/test-schema";

/**
 * Generates the CREATE statements for the full edition schema once per run, from the drizzle
 * table objects in the source tree (no migration files). Every worker applies them to its own
 * in-memory database in server-env.ts; generating here keeps drizzle-kit out of the workers.
 */
export default async function setup(project: TestProject) {
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  project.provide("chaiTestSchemaDdl", await generateSQLiteMigration(empty, current));
}
