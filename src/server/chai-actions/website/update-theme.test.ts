import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_THEME } from "~/drizzle/seed/defaults";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { getTestDb, schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { UpdateThemeAction } from "./update-theme";

const storedApp = async () => {
  const [row] = await getTestDb()
    .select({ theme: schema.apps.theme, changes: schema.apps.changes })
    .from(schema.apps)
    .where(eq(schema.apps.id, TEST_APP_ID));
  return row as { theme: any; changes: string[] | null };
};

describe("UpdateThemeAction", () => {
  it("merges fonts, radius and colours into the stored theme and marks it changed", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: DEFAULT_APP_THEME, changes: ["DESIGN_TOKENS"] });

      const result = await action(UpdateThemeAction).run({
        theme: {
          fontFamily: { heading: "Times New Roman" },
          borderRadius: "2px",
          colors: { primary: ["#1D4ED8", "#1E40AF"] },
        },
      });

      expect(result.changed).toEqual(["fontFamily.heading", "borderRadius", "colors.primary"]);
      const { theme, changes } = await storedApp();
      expect(theme.fontFamily).toEqual({ heading: "Times New Roman", body: DEFAULT_APP_THEME.fontFamily.body });
      expect(theme.borderRadius).toBe("2px");
      expect(theme.colors.primary).toEqual(["#1D4ED8", "#1E40AF"]);
      expect(theme.colors.background).toEqual(DEFAULT_APP_THEME.colors.background);
      expect(changes).toEqual(["DESIGN_TOKENS", "THEME"]);
    });
  });

  it("completes an empty stored theme from the default before patching", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: {}, changes: null });

      await action(UpdateThemeAction).run({ theme: { colors: { primary: ["#111111", "#222222"] } } });

      const { theme } = await storedApp();
      expect(Object.keys(theme.colors)).toEqual(expect.arrayContaining(Object.keys(DEFAULT_APP_THEME.colors)));
      expect(theme.fontFamily).toEqual(DEFAULT_APP_THEME.fontFamily);
      expect(theme.colors.primary).toEqual(["#111111", "#222222"]);
    });
  });

  it("writes nothing when the patch changes nothing", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: DEFAULT_APP_THEME, changes: null });

      const result = await action(UpdateThemeAction).run({
        theme: { colors: { primary: [...DEFAULT_APP_THEME.colors.primary] as [string, string] } },
      });

      expect(result.changed).toEqual([]);
      expect((await storedApp()).changes).toBeNull();
    });
  });

  it.each([
    [{ colors: { primary: ["blue", "#FFFFFF"] } }, /hex/],
    [{ colors: { brand: ["#000000", "#FFFFFF"] } }, /Invalid theme/],
    [{ borderRadius: "calc(1px)" }, /px or rem/],
    [{ fontFamily: { heading: 'Inter"; }' } }, /font family/],
    [{ spacing: "4px" }, /Invalid theme/],
    [{ fontFamily: { heading: "Fraunces" } }, /"Fraunces" is not a font this site can use/],
    [{ colors: { primary: ["#FFFF66", "#1D4ED8"] } }, /unreadable.*primary-foreground on primary/],
    [
      { colors: { purple: ["#7C3AED", "#7C3AED"], "purple-foreground": ["#7C3AED", "#7C3AED"] } },
      /unreadable.*purple-foreground on purple/,
    ],
  ] as Array<[unknown, RegExp]>)("rejects %j", async (theme, message) => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: DEFAULT_APP_THEME });
      // Deliberately invalid input: the action validates what a caller actually sends.
      await expect(action(UpdateThemeAction).run({ theme: theme as never })).rejects.toThrow(message);
    });
  });

  it("records the change in theme history", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: DEFAULT_APP_THEME });

      await action(UpdateThemeAction).run({ theme: { borderRadius: "2px" } });

      const revisions = await getTestDb()
        .select()
        .from(schema.appThemeRevisions)
        .where(eq(schema.appThemeRevisions.app, TEST_APP_ID));
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({ type: "draft", designTokens: null });
      expect((revisions[0].theme as { borderRadius: string }).borderRadius).toBe("2px");
    });
  });
});
