import {
  generateDrizzleJson,
  generateMigration,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";

/** The CREATE statements drizzle-kit derives for a sqlite schema module/record. */
export async function sqliteDdlStatements(schema: Record<string, unknown>): Promise<string[]> {
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema);
  return generateSQLiteMigration(empty, current);
}

/** `sqliteDdlStatements` as one string. */
export async function sqliteDdl(schema: Record<string, unknown>): Promise<string> {
  return (await sqliteDdlStatements(schema)).join("\n");
}

/** The CREATE statements drizzle-kit derives for a Postgres schema module/record, as one string. */
export async function pgDdl(schema: Record<string, unknown>): Promise<string> {
  const empty = generateDrizzleJson({});
  const current = generateDrizzleJson(schema);
  return (await generateMigration(empty, current)).join("\n");
}
