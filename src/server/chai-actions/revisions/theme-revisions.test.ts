import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { withChaiConfig } from "~/tests/setup/chai-config";
import { TEST_APP_ID, TEST_USER_ID } from "~/tests/setup/test-app";
import { getTestDb, schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { addThemePublishRevision, addThemeSaveRevision } from "./theme-revisions";

const rows = async () =>
  getTestDb()
    .select()
    .from(schema.appThemeRevisions)
    .where(eq(schema.appThemeRevisions.app, TEST_APP_ID))
    .orderBy(asc(schema.appThemeRevisions.createdAt));

const THEME_A = { borderRadius: "4px" };
const THEME_B = { borderRadius: "8px" };
const TOKENS_A = { "dt#a": { name: "card", value: "p-4" } };
const TOKENS_B = { "dt#a": { name: "card", value: "p-8" } };

const setMaxRevisions = (maxRevisions: number) =>
  withChaiConfig({
    features: { ...getActiveChaiBuilderConfig().features, revisions: { enabled: true, maxRevisions } } as never,
  });

describe("theme revisions", () => {
  // Every write a second apart, so history order never hinges on two writes sharing a millisecond.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());
  const tick = () => vi.setSystemTime(Date.now() + 1000);

  it("keeps theme and design token saves in separate rows", async () => {
    await withTestDB(async () => {
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { theme: THEME_A });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_A });

      const saved = await rows();
      expect(saved).toHaveLength(2);
      expect(saved[0]).toMatchObject({ theme: THEME_A, designTokens: null, type: "draft" });
      expect(saved[1]).toMatchObject({ theme: null, designTokens: TOKENS_A, type: "draft" });
    });
  });

  it("splits a combined save into one row per scope", async () => {
    await withTestDB(async () => {
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { theme: THEME_A, designTokens: TOKENS_A });

      const saved = await rows();
      expect(saved).toHaveLength(2);
      expect(saved.every((row) => (row.theme === null) !== (row.designTokens === null))).toBe(true);
    });
  });

  it("collapses consecutive same-editor drafts within a scope, across saves of the other scope", async () => {
    await withTestDB(async () => {
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_A });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { theme: THEME_A });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_B });

      const saved = await rows();
      expect(saved).toHaveLength(2);
      expect(saved.find((row) => row.designTokens)?.designTokens).toEqual(TOKENS_B);
      expect(saved.find((row) => row.theme)?.theme).toEqual(THEME_A);
    });
  });

  it("does not collapse after a publish, for another editor, or with forceNew", async () => {
    await withTestDB(async () => {
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_A });
      tick();
      await addThemePublishRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_A });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_B });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, "someone-else", { designTokens: TOKENS_B });
      tick();
      await addThemeSaveRevision(TEST_APP_ID, "someone-else", { designTokens: TOKENS_A }, { forceNew: true });

      expect((await rows()).map((row) => row.type)).toEqual(["draft", "published", "draft", "draft", "draft"]);
    });
  });

  it("never collapses into a legacy row that holds both columns", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appThemeRevisions", {
        app: TEST_APP_ID,
        type: "draft",
        currentEditor: TEST_USER_ID,
        theme: THEME_A,
        designTokens: TOKENS_A,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      });

      tick();

      await addThemeSaveRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_B });

      const saved = await rows();
      expect(saved).toHaveLength(2);
      expect(saved[0]).toMatchObject({ theme: THEME_A, designTokens: TOKENS_A });
    });
  });

  it("caps each scope's history on its own", async () => {
    await withTestDB(async () => {
      setMaxRevisions(2);
      tick();
      await addThemePublishRevision(TEST_APP_ID, TEST_USER_ID, { theme: THEME_A });
      for (const tokens of [TOKENS_A, TOKENS_B, TOKENS_A]) {
        tick();
        await addThemePublishRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: tokens });
      }

      const saved = await rows();
      expect(saved.filter((row) => row.theme)).toHaveLength(1);
      expect(saved.filter((row) => row.designTokens)).toHaveLength(2);
    });
  });

  it("prunes a legacy two-column row only once it is past the cap in both histories", async () => {
    await withTestDB(async ({ seed }) => {
      setMaxRevisions(1);
      await seed("appThemeRevisions", {
        app: TEST_APP_ID,
        type: "published",
        theme: THEME_A,
        designTokens: TOKENS_A,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      });

      tick();

      await addThemePublishRevision(TEST_APP_ID, TEST_USER_ID, { designTokens: TOKENS_B });
      expect(await rows()).toHaveLength(2);

      tick();

      await addThemePublishRevision(TEST_APP_ID, TEST_USER_ID, { theme: THEME_B });
      const saved = await rows();
      expect(saved).toHaveLength(2);
      expect(saved.some((row) => row.theme && row.designTokens)).toBe(false);
    });
  });
});
