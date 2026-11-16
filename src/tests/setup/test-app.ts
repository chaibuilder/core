import * as schema from "~/edition/test-schema";
import type { TestDb } from "./test-db";

/** The app every test runs against. Seeded into each worker's database before every test. */
export const TEST_APP_ID = "00000000-0000-4000-8000-000000000001";
/** The user `withTestDB().action()` and `withRequestContext()` act as by default. */
export const TEST_USER_ID = "test-user-global";

export async function seedTestApp(db: TestDb): Promise<void> {
  const createdAt = new Date().toISOString();
  const app = {
    id: TEST_APP_ID,
    name: "Global Test App",
    createdAt,
    settings: {},
    theme: {},
    fallbackLang: "en",
    languages: [],
    designTokens: {},
  };
  await db.insert(schema.apps).values({ ...app, ai: {}, configData: {}, consentConfig: {} } as any);
  await db.insert(schema.appsOnline).values(app as any);
}
