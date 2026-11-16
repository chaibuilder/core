import { describe, expect, it } from "vitest";
import { withChaiConfig } from "~/tests/setup/chai-config";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import type { ChaiSiteSettingsTransform } from "~/types/server-config";
import { GetWebsiteSettingsAction } from "./get-website-settings";

describe("GetWebsiteSettingsAction", () => {
  it("hands the app's transform the whole row, not just the settings columns", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: { borderRadius: "9px" } });
      const seen: Record<string, any>[] = [];
      const transform: ChaiSiteSettingsTransform = (row) => {
        seen.push(row);
        return { ...row, theme: { ...row.theme, derivedFrom: row.id } };
      };
      withChaiConfig({ transformSiteSettings: transform });

      const result = await action(GetWebsiteSettingsAction).run({ draft: true });

      expect(seen[0]).toMatchObject({ id: TEST_APP_ID, theme: { borderRadius: "9px" } });
      expect(result.theme).toEqual({ borderRadius: "9px", derivedFrom: TEST_APP_ID });
    });
  });

  it("returns only the settings fields, never the rest of the row", async () => {
    await withTestDB(async ({ action }) => {
      withChaiConfig({ transformSiteSettings: (row) => ({ ...row, internal: "secret" }) });

      const result = (await action(GetWebsiteSettingsAction).run({ draft: true })) as Record<string, unknown>;

      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("internal");
      expect(result.appKey).toEqual(expect.any(String));
    });
  });

  it("returns the stored theme when the app registers no transform", async () => {
    await withTestDB(async ({ seedUpdate, action }) => {
      await seedUpdate("apps", { id: TEST_APP_ID }, { theme: { borderRadius: "5px" } });
      withChaiConfig({ transformSiteSettings: undefined });

      const result = await action(GetWebsiteSettingsAction).run({ draft: true });

      expect(result.theme).toEqual({ borderRadius: "5px" });
    });
  });
});
