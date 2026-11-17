import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { registerChaiDb } from "~/db/core";
import { schema } from "~/server/chai-actions/db";
import { pageSlugTag, slugTag } from "~/server/chai-builder/public/page-routing-cache";
import { fake } from "~/tests/setup/fakers";
import { getTestDb, getTestSqlite, registerTestDb, schema as testSchema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { DeletePageAction } from "./delete-page";

describe("DeletePageAction", () => {
  it("takes a trashed page offline in the draft as well as the online table", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/to-trash", online: true, currentEditor: null }));
      await seed("appPagesOnline", fake.appPagesOnline({ id: page.id, slug: "/to-trash" }));

      await action(DeletePageAction).run({ id: page.id });

      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.deletedAt).toBeTruthy();
      expect(draft?.online).toBe(false);
      const online = await db.query.appPagesOnline.findFirst({ where: eq(schema.appPagesOnline.id, page.id) });
      expect(online).toBeUndefined();
    });
  });

  it("restores a trashed page as unpublished", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/restored", online: true, currentEditor: null }));
      await seed("appPagesOnline", fake.appPagesOnline({ id: page.id, slug: "/restored" }));
      const deleteAction = action(DeletePageAction);

      await deleteAction.run({ id: page.id });
      await deleteAction.restorePage(page.id);

      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.deletedAt).toBeNull();
      expect(draft?.online).toBe(false);
      const online = await db.query.appPagesOnline.findFirst({ where: eq(schema.appPagesOnline.id, page.id) });
      expect(online).toBeUndefined();
    });
  });

  it("restoring a trashed page removes a live row it still has", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // Trashed while live (before trash cleared the online row): both rows exist.
      const page = await seed(
        "appPages",
        fake.appPages({ slug: "/still-live", online: true, currentEditor: null, deletedAt: new Date().toISOString() }),
      );
      await seed("appPagesOnline", fake.appPagesOnline({ id: page.id, slug: "/still-live" }));

      const tags = await action(DeletePageAction).restorePage(page.id);

      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.deletedAt).toBeNull();
      expect(draft?.online).toBe(false);
      const online = await db.query.appPagesOnline.findFirst({ where: eq(schema.appPagesOnline.id, page.id) });
      expect(online).toBeUndefined();
      expect(tags).toEqual(expect.arrayContaining([pageSlugTag(page.id), slugTag("/still-live")]));
    });
  });

  it("restoring a trashed primary page also removes live language variants", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const deletedAt = new Date().toISOString();
      const primary = await seed(
        "appPages",
        fake.appPages({ slug: "/primary", online: true, currentEditor: null, deletedAt }),
      );
      const variant = await seed(
        "appPages",
        fake.appPages({
          slug: "/en/primary",
          lang: "en",
          primaryPage: primary.id,
          online: true,
          currentEditor: null,
          deletedAt,
        }),
      );
      await seed("appPagesOnline", fake.appPagesOnline({ id: primary.id, slug: "/primary" }));
      await seed(
        "appPagesOnline",
        fake.appPagesOnline({ id: variant.id, slug: "/en/primary", lang: "en", primaryPage: primary.id }),
      );

      const tags = await action(DeletePageAction).restorePage(primary.id);

      const onlineRows = await db.query.appPagesOnline.findMany({
        where: inArray(schema.appPagesOnline.id, [primary.id, variant.id]),
      });
      expect(onlineRows).toEqual([]);
      const variantDraft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, variant.id) });
      expect(variantDraft?.deletedAt).toBeNull();
      expect(tags).toEqual(
        expect.arrayContaining([pageSlugTag(variant.id), slugTag("/en/primary"), `alternate-${primary.id}`]),
      );
    });
  });

  it("restores a page trashed before trash cleared `online` as unpublished", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // Legacy state: trashed, no online row, draft still flagged online.
      const page = await seed(
        "appPages",
        fake.appPages({ slug: "/legacy", online: true, currentEditor: null, deletedAt: new Date().toISOString() }),
      );

      await action(DeletePageAction).restorePage(page.id);

      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.deletedAt).toBeNull();
      expect(draft?.online).toBe(false);
    });
  });

  it("does not take a restored, republished page back offline on a repeated restore", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/republished", online: true, currentEditor: null }));

      await action(DeletePageAction).restorePage(page.id);

      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.online).toBe(true);
    });
  });

  it("on Postgres, a failed draft write rolls back the online delete", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ slug: "/atomic", online: true, currentEditor: null }));
      await seed("appPagesOnline", fake.appPagesOnline({ id: page.id, slug: "/atomic" }));

      // The test database is sqlite: register it as "pg" with a transaction that
      // really commits or rolls back the connection, and make the draft write fail.
      const sqlite = getTestSqlite();
      const real = getTestDb();
      const pgLike = new Proxy(real, {
        get: (target, prop) =>
          prop === "transaction"
            ? async (fn: (tx: typeof real) => Promise<unknown>) => {
                sqlite.exec("BEGIN");
                try {
                  const result = await fn(target);
                  sqlite.exec("COMMIT");
                  return result;
                } catch (error) {
                  sqlite.exec("ROLLBACK");
                  throw error;
                }
              }
            : Reflect.get(target, prop),
      });
      registerChaiDb({ drizzle: pgLike as never, schema: testSchema, dialect: "pg" });
      sqlite.exec("CREATE TRIGGER fail_trash BEFORE UPDATE ON app_pages BEGIN SELECT RAISE(ABORT, 'boom'); END");
      try {
        await expect(action(DeletePageAction).run({ id: page.id })).rejects.toThrow();
      } finally {
        sqlite.exec("DROP TRIGGER fail_trash");
        registerTestDb();
      }

      const online = await db.query.appPagesOnline.findFirst({ where: eq(schema.appPagesOnline.id, page.id) });
      expect(online).toBeDefined();
      const draft = await db.query.appPages.findFirst({ where: eq(schema.appPages.id, page.id) });
      expect(draft?.deletedAt).toBeNull();
    });
  });
});
