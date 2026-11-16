import { describe, expect, it } from "vitest";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { CreatePageAction } from "./create-page";
import { GLOBAL_JSONLD_PAGE_TYPE } from "./default-global-jsonlds";

/** Seeds a shared JSON-LD schema record (they live in `app_pages_online`). */
async function seedSchema(
  seed: Parameters<Parameters<typeof withTestDB>[0]>[0]["seed"],
  over: { id: string; metadata?: unknown; primaryPage?: string | null; lang?: string },
) {
  return seed("appPagesOnline", {
    pageType: GLOBAL_JSONLD_PAGE_TYPE,
    slug: "",
    app: TEST_APP_ID,
    ...over,
  } as never);
}

describe("CreatePageAction - default shared JSON-LD seeding", () => {
  it("seeds the schemas flagged addToNewPages onto a new page", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      await seedSchema(seed, { id: "schema-default", metadata: { addToNewPages: true } });
      await seedSchema(seed, { id: "schema-optional", metadata: { addToNewPages: false } });

      const result = await action(CreatePageAction).run({
        name: "Seeded Page",
        slug: "/seeded-page",
        pageType: "page",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.globalJsonLds).toEqual(["schema-default"]);
    });
  });

  it("stores the primary id for a language variant of a schema", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      await seedSchema(seed, { id: "schema-primary", metadata: {} });
      await seedSchema(seed, {
        id: "schema-fr",
        primaryPage: "schema-primary",
        lang: "fr",
        metadata: { addToNewPages: true },
      });

      const result = await action(CreatePageAction).run({
        name: "Variant Page",
        slug: "/variant-page",
        pageType: "page",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.globalJsonLds).toEqual(["schema-primary"]);
    });
  });

  it("creates an empty list when no schema is flagged", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      await seedSchema(seed, { id: "schema-optional", metadata: { description: "unflagged" } });

      const result = await action(CreatePageAction).run({
        name: "Plain Page",
        slug: "/plain-page",
        pageType: "page",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.globalJsonLds).toEqual([]);
    });
  });

  // Language pages read the primary's list at render time; partials and folders
  // never render a <head> of their own.
  it.each([
    { label: "a slugless partial", data: { pageType: "global", hasSlug: false } },
    { label: "a folder", data: { pageType: "_folder" } },
  ])("does not seed $label", async ({ data }) => {
    await withTestDB(async ({ db, seed, action }) => {
      await seedSchema(seed, { id: "schema-default", metadata: { addToNewPages: true } });

      const result = await action(CreatePageAction).run({
        name: "No Head",
        slug: "/no-head",
        ...data,
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.globalJsonLds).toEqual([]);
    });
  });

  it("does not seed a language page", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      await seedSchema(seed, { id: "schema-default", metadata: { addToNewPages: true } });
      const primary = await action(CreatePageAction).run({
        name: "Primary",
        slug: "/primary",
        pageType: "page",
      });

      const languagePage = await action(CreatePageAction).run({
        name: "Primary FR",
        slug: "/primary-fr",
        pageType: "page",
        lang: "fr",
        primaryPage: primary.page.id,
      });

      // The action returns the primary id for language pages; read the row back by slug+lang.
      const rows = await db.query.appPages.findMany({
        where: (pages, { and, eq }) => and(eq(pages.primaryPage, primary.page.id), eq(pages.lang, "fr")),
      });
      expect(languagePage.page.id).toBe(primary.page.id);
      expect(rows[0]?.globalJsonLds).toEqual([]);
    });
  });
});
