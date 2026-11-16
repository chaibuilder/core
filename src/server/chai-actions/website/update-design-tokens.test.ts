import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { getTestDb, schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { UpdateDesignTokensAction } from "./update-design-tokens";

const storedApp = async () => {
  const [row] = await getTestDb()
    .select({ designTokens: schema.apps.designTokens, changes: schema.apps.changes })
    .from(schema.apps)
    .where(eq(schema.apps.id, TEST_APP_ID));
  return row as { designTokens: Record<string, any>; changes: string[] | null };
};

const SITE_TOKEN = { "dt#a1b2c3d4e5f6": { name: "Hero-Panel", value: "rounded-2xl bg-card p-10" } };

describe("UpdateDesignTokensAction", () => {
  it("restyles a built-in token and keeps its behaviour classes", async () => {
    await withTestDB(async ({ action }) => {
      const result = await action(UpdateDesignTokensAction).run({
        tokens: [{ id: "dt#btn", value: "rounded-full px-6 block" }],
      });

      const { designTokens, changes } = await storedApp();
      const classes = designTokens["dt#btn"].value.split(/\s+/);
      expect(classes).toContain("rounded-full");
      expect(classes).toContain("inline-flex");
      expect(classes).not.toContain("block");
      expect(designTokens["dt#btn"].name).toBe(CHAI_BUILT_IN_DESIGN_TOKENS["dt#btn"].name);
      expect(changes).toEqual(["DESIGN_TOKENS"]);
      expect(result.updated).toEqual([{ id: "dt#btn", name: "Button", value: designTokens["dt#btn"].value }]);
    });
  });

  it("resets a built-in override", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate(
        "apps",
        { id: TEST_APP_ID },
        { designTokens: { "dt#card": { ...CHAI_BUILT_IN_DESIGN_TOKENS["dt#card"], value: "rounded-none" } } },
      );

      await action(UpdateDesignTokensAction).run({ tokens: [{ id: "dt#card", reset: true }] });

      expect((await storedApp()).designTokens).not.toHaveProperty("dt#card");
    });
  });

  it("edits an existing site token", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { designTokens: SITE_TOKEN });

      await action(UpdateDesignTokensAction).run({
        tokens: [{ id: "dt#a1b2c3d4e5f6", value: "rounded-3xl bg-muted p-12", name: "Hero-Surface" }],
      });

      expect((await storedApp()).designTokens["dt#a1b2c3d4e5f6"]).toEqual({
        name: "Hero-Surface",
        value: "rounded-3xl bg-muted p-12",
      });
    });
  });

  it("never creates a token", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { designTokens: SITE_TOKEN });

      await expect(
        action(UpdateDesignTokensAction).run({ tokens: [{ id: "dt#brand-new", value: "p-4" }] }),
      ).rejects.toThrow(/create new tokens in the builder/);

      expect(Object.keys((await storedApp()).designTokens)).toEqual(["dt#a1b2c3d4e5f6"]);
    });
  });

  it.each([
    [[{ id: "dt#btn", value: "dt#card px-2" }], /another token/],
    [[{ id: "dt#btn", value: "x;}body{" }], /not Tailwind/],
    [[{ id: "dt#btn" }], /pass value/],
    [
      [
        { id: "dt#btn", value: "px-2" },
        { id: "dt#btn", value: "px-3" },
      ],
      /more than once/,
    ],
    [[{ id: "dt#btn", value: "px-3", archived: true }], /archived apply to site tokens only/],
    [[{ id: "dt#a1b2c3d4e5f6", name: "Button" }], /already named/],
    [[{ id: "dt#a1b2c3d4e5f6", name: "has space" }], /letters, digits and hyphens/],
    [[], /Invalid tokens/],
  ])("rejects %j", async (tokens, message) => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { designTokens: SITE_TOKEN });
      await expect(action(UpdateDesignTokensAction).run({ tokens })).rejects.toThrow(message);
    });
  });
});
