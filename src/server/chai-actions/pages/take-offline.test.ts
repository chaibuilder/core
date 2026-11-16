import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { TakeOfflineAction } from "./take-offline";

describe("TakeOfflineAction - Integration", () => {
  it("should take a primary page offline", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ slug: "primary-page", online: true }));

      // Seed a corresponding online page record
      await seed("appPagesOnline", fake.appPages({ id: page.id, slug: "primary-page", online: true }));

      const result = await action(TakeOfflineAction).run({ id: page.id });

      expect(result.tags).toContain(`page-${page.id}`);
      expect(result.tags).toContain(`page-slug:${page.id}`);
      expect(result.paths).toContain("primary-page");
      expect(result.page).toBeDefined();
      expect(result.page.id).toBe(page.id);
      expect(result.page.online).toBe(false);

      // Verify the page's online status is false in the database
      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage?.online).toBe(false);

      // Verify the online pages record was deleted
      const onlinePages = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, page.id),
      });
      expect(onlinePages).toHaveLength(0);
    });
  });

  it("should take a language page offline", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const primaryPage = await seed("appPages", fake.appPages({ slug: "primary-page", online: true }));

      const langPage = await seed(
        "appPages",
        fake.appPages({
          slug: "primary-page",
          lang: "fr",
          primaryPage: primaryPage.id,
          online: true,
        }),
      );

      await seed(
        "appPagesOnline",
        fake.appPages({
          id: langPage.id,
          slug: "primary-page",
          lang: "fr",
          primaryPage: primaryPage.id,
          online: true,
        }),
      );

      const result = await action(TakeOfflineAction).run({ id: langPage.id });

      expect(result.tags).toContain(`page-${primaryPage.id}`);
      expect(result.tags).toContain(`page-slug:${langPage.id}`);
      expect(result.tags).toContain(`page-slug:${primaryPage.id}`);
      expect(result.paths).toHaveLength(0);

      // Verify the primary page is still online
      const updatedPrimaryPage = await getPageById(db, primaryPage.id);
      expect(updatedPrimaryPage?.online).toBe(true);

      // Verify the language page is marked offline
      const updatedPage = await getPageById(db, langPage.id);
      expect(updatedPage?.online).toBe(false);
    });
  });

  it("should take a partial page offline", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // A partial page has an empty slug
      const partialPage = await seed("appPages", fake.appPages({ slug: "", pageType: "partial", online: true }));

      // Create a page that uses this partial
      const consumerPage = await seed(
        "appPages",
        fake.appPages({ slug: "consumer-page", partialBlocks: partialPage.id, online: true }),
      );

      // Seed online page record for the partial
      await seed("appPagesOnline", fake.appPages({ id: partialPage.id, slug: "", pageType: "partial", online: true }));

      const result = await action(TakeOfflineAction).run({ id: partialPage.id });

      expect(result.tags).toContain(`page-${consumerPage.id}`);
      expect(result.paths).toHaveLength(0);

      // Verify the consumer page is still online
      const updatedConsumerPage = await getPageById(db, consumerPage.id);
      expect(updatedConsumerPage?.online).toBe(true);

      // Verify partial is marked offline
      const updatedPartial = await getPageById(db, partialPage.id);
      expect(updatedPartial?.online).toBe(false);
    });
  });

  it("should throw error when page does not exist", async () => {
    await withTestDB(async ({ action }) => {
      await expect(action(TakeOfflineAction).run({ id: randomUUID() })).rejects.toThrow("Page not found");
    });
  });

  it("should validate that page ID is required", async () => {
    await withTestDB(async ({ action }) => {
      await expect(action(TakeOfflineAction).run({ id: "" })).rejects.toThrow();
    });
  });

  it("should not take offline a page belonging to another app", async () => {
    await withTestDB(async ({ seed, action }) => {
      const otherApp = await seed("apps", { name: "Other App" });

      const page = await seed("appPages", fake.appPages({ app: otherApp.id, slug: "/other-app-page", online: true }));

      await expect(action(TakeOfflineAction).run({ id: page.id })).rejects.toThrow("Page not found");
    });
  });
});
