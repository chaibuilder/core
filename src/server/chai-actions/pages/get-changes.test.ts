import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { GetChangesAction } from "./get-changes";

describe("GetChangesAction", () => {
  it("leaves trashed pages out of the publish list", async () => {
    await withTestDB(async ({ seed, action }) => {
      const trashed = { deletedAt: new Date().toISOString() };
      const changed = await seed("appPages", fake.appPages({ online: true, changes: ["Page"] }));
      const offline = await seed("appPages", fake.appPages({ online: false, currentEditor: null }));
      const trashedChanged = await seed("appPages", fake.appPages({ ...trashed, online: true, changes: ["Page"] }));
      const trashedOffline = await seed("appPages", fake.appPages({ ...trashed, online: false, currentEditor: null }));

      const pages: Array<{ id: string }> = await action(GetChangesAction).run({});
      const ids = pages.map((page) => page.id);

      expect(ids).toEqual(expect.arrayContaining([changed.id, offline.id]));
      expect(ids).not.toContain(trashedChanged.id);
      expect(ids).not.toContain(trashedOffline.id);
    });
  });
});
