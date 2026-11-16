import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { getTestDb, schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { SaveAiContextAction } from "./save-ai-context";

const DESIGN_SYSTEM = {
  version: 1,
  enabled: true,
  northStar: "Flour and fire",
  mode: "persuade",
  overview: "Warm, crafted",
  colors: "",
  typography: "",
  layout: "",
  elevation: "",
  shapes: "",
  components: "",
  dosAndDonts: "",
  updatedAt: "2026-09-01T10:00:00.000Z",
  source: "mcp",
};

const BRIEF = { mode: "persuade", thesis: "Bread first", updatedAt: "2026-09-01T10:00:00.000Z" };

const storedAppAi = async () => {
  const [row] = await getTestDb()
    .select({ ai: schema.apps.ai })
    .from(schema.apps)
    .where(eq(schema.apps.id, TEST_APP_ID));
  return row.ai as Record<string, unknown>;
};

const storedPageAi = async (id: string) => {
  const [row] = await getTestDb()
    .select({ ai: schema.appPages.ai })
    .from(schema.appPages)
    .where(eq(schema.appPages.id, id));
  return row.ai as Record<string, unknown>;
};

describe("SaveAiContextAction", () => {
  describe("replace (the builder's context modal)", () => {
    it("replaces the stored site context, as before", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Old", look: "Modern", tone: "Warm" } });

        await action(SaveAiContextAction).run({ type: "app", aiData: { siteContext: "New", tone: "Bold" } });

        expect(await storedAppAi()).toEqual({ siteContext: "New", tone: "Bold" });
      });
    });

    it("carries the stored design system over when the payload does not mention it", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Old", designSystem: DESIGN_SYSTEM } });

        const result = await action(SaveAiContextAction).run({ type: "app", aiData: { siteContext: "New" } });

        expect(await storedAppAi()).toEqual({ siteContext: "New", designSystem: DESIGN_SYSTEM });
        expect(result.aiData).toEqual({ siteContext: "New", designSystem: DESIGN_SYSTEM });
      });
    });

    it("removes the design system when the payload sends null for it", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Old", designSystem: DESIGN_SYSTEM } });

        await action(SaveAiContextAction).run({ type: "app", aiData: { siteContext: "Old", designSystem: null } });

        expect(await storedAppAi()).toEqual({ siteContext: "Old" });
      });
    });

    it("carries the page brief over on a page save", async () => {
      await withTestDB(async ({ seed, action }) => {
        const page = await seed("appPages", { ...fake.appPages(), ai: { pageContext: "Old", designBrief: BRIEF } });

        await action(SaveAiContextAction).run({ type: "page", pageId: page.id, aiData: { pageContext: "New" } });

        expect(await storedPageAi(page.id)).toEqual({ pageContext: "New", designBrief: BRIEF });
      });
    });
  });

  describe("merge", () => {
    it("merges top-level keys and deletes the ones sent as null", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Bakery", tone: "Warm", look: "Modern" } });

        await action(SaveAiContextAction).run({
          type: "app",
          merge: true,
          aiData: { designSystem: DESIGN_SYSTEM, look: null },
        });

        expect(await storedAppAi()).toEqual({ siteContext: "Bakery", tone: "Warm", designSystem: DESIGN_SYSTEM });
      });
    });

    it("merges a page brief into the page context", async () => {
      await withTestDB(async ({ seed, action }) => {
        const page = await seed("appPages", { ...fake.appPages(), ai: { pageContext: "Menu" } });

        await action(SaveAiContextAction).run({
          type: "page",
          pageId: page.id,
          merge: true,
          aiData: { designBrief: BRIEF },
        });

        expect(await storedPageAi(page.id)).toEqual({ pageContext: "Menu", designBrief: BRIEF });
      });
    });

    it.each([["Bakery"], [["Bakery"]]])("rejects a non-object %j and leaves the row alone", async (aiData) => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Bakery", designSystem: DESIGN_SYSTEM } });

        await expect(action(SaveAiContextAction).run({ type: "app", merge: true, aiData })).rejects.toThrow(
          /aiData must be an object when merge is true/,
        );

        expect(await storedAppAi()).toEqual({ siteContext: "Bakery", designSystem: DESIGN_SYSTEM });
      });
    });
  });

  describe("design-system validation", () => {
    it("rejects an invalid design system and leaves the row alone", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Bakery" } });

        await expect(
          action(SaveAiContextAction).run({
            type: "app",
            merge: true,
            aiData: { designSystem: { ...DESIGN_SYSTEM, mode: "loud" } },
          }),
        ).rejects.toThrow(/Invalid designSystem/);

        expect(await storedAppAi()).toEqual({ siteContext: "Bakery" });
      });
    });

    it("rejects an invalid page brief", async () => {
      await withTestDB(async ({ seed, action }) => {
        const page = await seed("appPages", fake.appPages());
        await expect(
          action(SaveAiContextAction).run({
            type: "page",
            pageId: page.id,
            merge: true,
            aiData: { designBrief: { mode: "persuade", thesis: "" } },
          }),
        ).rejects.toThrow(/Invalid designBrief/);
      });
    });

    it("refuses a stale copy of the design system and saves nothing", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        const newer = { ...DESIGN_SYSTEM, northStar: "Newer", updatedAt: "2026-09-02T10:00:00.000Z" };
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { designSystem: newer } });

        await expect(
          action(SaveAiContextAction).run({
            type: "app",
            merge: true,
            aiData: { designSystem: DESIGN_SYSTEM, tone: "Warm" },
          }),
        ).rejects.toThrow(/changed since this copy was read/);

        expect(await storedAppAi()).toEqual({ designSystem: newer });
      });
    });

    it("saves only while the stored design system still equals expectedDesign", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        const newer = { ...DESIGN_SYSTEM, northStar: "Newer", updatedAt: "2026-09-02T10:00:00.000Z" };
        const patched = { ...DESIGN_SYSTEM, colors: "Crust brown", updatedAt: "2026-09-03T10:00:00.000Z" };
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { designSystem: newer } });

        const run = (expectedDesign: unknown) =>
          action(SaveAiContextAction).run({
            type: "app",
            merge: true,
            aiData: { designSystem: patched },
            expectedDesign,
          });

        await expect(run(DESIGN_SYSTEM)).rejects.toThrow(/designSystem was changed since it was read/);
        await expect(run(null)).rejects.toThrow(/designSystem was changed since it was read/);
        expect(await storedAppAi()).toEqual({ designSystem: newer });

        await run(newer);
        expect(await storedAppAi()).toEqual({ designSystem: patched });
      });
    });

    it("does not validate a stored design system the save leaves alone", async () => {
      await withTestDB(async ({ seedUpdate, action }) => {
        // An older shape the lenient readers accept, but the strict schema does not.
        const legacy = { version: 1, enabled: true, northStar: "Flour", mode: "persuade" };
        await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Old", designSystem: legacy } });

        await action(SaveAiContextAction).run({ type: "app", aiData: { siteContext: "New" } });
        await action(SaveAiContextAction).run({ type: "app", merge: true, aiData: { tone: "Warm" } });

        expect(await storedAppAi()).toEqual({ siteContext: "New", tone: "Warm", designSystem: legacy });
      });
    });
  });

  it("keeps every key when merges run in parallel", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { ai: { siteContext: "Bakery" } });

      await Promise.all(
        ["tone", "look", "bannedWords"].map((key) =>
          action(SaveAiContextAction).run({ type: "app", merge: true, aiData: { [key]: key } }),
        ),
      );

      expect(await storedAppAi()).toEqual({
        siteContext: "Bakery",
        tone: "tone",
        look: "look",
        bannedWords: "bannedWords",
      });
    });
  });

  it("still refuses a page of another app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const page = await seed("appPages", fake.appPages());
      await expect(
        action(SaveAiContextAction, { appId: "another-tenant-app" }).run({
          type: "page",
          pageId: page.id,
          aiData: { pageContext: "x" },
        }),
      ).rejects.toThrow(/Page not found/);
    });
  });
});
