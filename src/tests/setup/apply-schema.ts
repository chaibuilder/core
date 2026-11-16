import type Database from "better-sqlite3";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** CREATE statements for the edition test schema, generated once by global-setup.ts. */
    chaiTestSchemaDdl: string[];
  }
}

/** Creates every table of the edition schema in `sqlite` (DDL provided by the global setup). */
export function applyTestSchema(sqlite: Database.Database): void {
  for (const statement of inject("chaiTestSchemaDdl")) {
    sqlite.exec(statement);
  }
}
