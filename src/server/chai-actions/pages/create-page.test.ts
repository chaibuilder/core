import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { assertPageExists, getPageById } from "~/tests/utils/assertions";
import { CreatePageAction } from "./create-page";

describe("CreatePageAction - Integration", () => {
  it("should create a page in the database", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Test Page",
        slug: "/test-page",
        pageType: "default",
      });

      expect(result.page).toBeDefined();
      expect(result.page.name).toBe("Test Page");
      expect(result.page.slug).toBe("/test-page");
      expect(result.page.pageType).toBe("default");

      await assertPageExists(db, result.page.id);

      const page = await getPageById(db, result.page.id);
      expect(page).toBeDefined();
      expect(page?.name).toBe("Test Page");
      expect(page?.slug).toBe("/test-page");
      expect(page?.app).toBe(TEST_APP_ID);
    });
  });

  it("should create a page with custom SEO data", async () => {
    await withTestDB(async ({ db, action }) => {
      const seoData = {
        title: "Custom SEO Title",
        description: "Custom description",
        noIndex: false,
      };

      const result = await action(CreatePageAction).run({
        name: "SEO Test Page",
        slug: "/seo-test-page",
        pageType: "default",
        seo: seoData,
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.seo).toBeDefined();
      expect((page?.seo as any)?.title).toBe("Custom SEO Title");
      expect((page?.seo as any)?.description).toBe("Custom description");
    });
  });

  it("should persist the tracking sent by the page creator (#4192)", async () => {
    await withTestDB(async ({ db, action }) => {
      const tracking = { gtm: { pageType: "blogue" }, forms: { revenueType: "new" } };
      const result = await action(CreatePageAction).run({
        name: "Tracked Page",
        slug: "/tracked-page",
        pageType: "default",
        tracking,
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.tracking).toEqual(tracking);
    });
  });

  it("should default tracking to an empty object when none is sent", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Untracked Page",
        slug: "/untracked-page",
        pageType: "default",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.tracking).toEqual({});
    });
  });

  it("should store an AI-facing description in metadata for a partial", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Site Header",
        slug: "",
        pageType: "global",
        hasSlug: false,
        description: "The main site header with navigation and logo.",
      });

      const page = await getPageById(db, result.page.id);
      expect((page?.metadata as any)?.description).toBe("The main site header with navigation and logo.");
    });
  });

  it("should default metadata to an empty object when no description is provided", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Site Footer",
        slug: "",
        pageType: "global",
        hasSlug: false,
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.metadata).toEqual({});
    });
  });

  it("should store tags in metadata for a partial", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "FAQ Section",
        slug: "",
        pageType: "global",
        hasSlug: false,
        description: "Reusable FAQ block.",
        tags: ["Section", "FAQ"],
      });

      const page = await getPageById(db, result.page.id);
      expect((page?.metadata as any)?.__tags).toEqual(["Section", "FAQ"]);
      expect((page?.metadata as any)?.description).toBe("Reusable FAQ block.");
    });
  });

  it("should normalize tags (trim, dedupe case-insensitively, drop empties)", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "CTA Section",
        slug: "",
        pageType: "global",
        hasSlug: false,
        tags: ["  CTA  ", "cta", "Section", "   "],
      });

      const page = await getPageById(db, result.page.id);
      expect((page?.metadata as any)?.__tags).toEqual(["CTA", "Section"]);
    });
  });

  it("should omit tags from metadata when none provided", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Plain Partial",
        slug: "",
        pageType: "global",
        hasSlug: false,
        description: "Has a description but no tags.",
      });

      const page = await getPageById(db, result.page.id);
      expect((page?.metadata as any)?.__tags).toBeUndefined();
    });
  });

  it("should create a folder page with a slug", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Company",
        slug: "/company",
        pageType: "_folder",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.pageType).toBe("_folder");
      expect(page?.slug).toBe("/company");
    });
  });

  it("should reject a slug with {{…}} template segments", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(CreatePageAction).run({
          name: "Used",
          slug: "/en/used-cars/{{make}}",
          pageType: "default",
        }),
      ).rejects.toThrow();
    });
  });

  it("should reject a folder without a slug", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "",
          pageType: "_folder",
        }),
      ).rejects.toThrow("Folder requires a slug");
    });
  });

  it("should reject a folder with the root slug", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "/",
          pageType: "_folder",
        }),
      ).rejects.toThrow("Folder requires a slug");
    });
  });

  it("should reject a dynamic folder", async () => {
    await withTestDB(async ({ action }) => {
      // A dynamic folder bypasses the static-lookup exclusion and resolves through
      // the dynamic-candidate path, rendering at the URL it must 404 on. The builder
      // never offers the combination, but this action is reachable directly.
      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "/company",
          pageType: "_folder",
          dynamic: true,
        }),
      ).rejects.toThrow("Folder cannot be dynamic");
    });
  });

  it("should reject a folder that inherits dynamic from its primary page", async () => {
    await withTestDB(async ({ seed, action }) => {
      // The payload looks harmless — no `dynamic` flag at all — but a primaryPage
      // reference makes the row dynamic before it is written, so the guard has to
      // run on the effective value rather than the incoming one.
      const primary = await seed("appPages", fake.appPages({ slug: "/listings", pageType: "page", dynamic: true }));

      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "/company",
          pageType: "_folder",
          primaryPage: primary.id,
        }),
      ).rejects.toThrow("Folder cannot be dynamic");
    });
  });

  it("should reject a folder whose slug is used by a page of any type", async () => {
    await withTestDB(async ({ seed, action }) => {
      await seed("appPages", fake.appPages({ slug: "/company", pageType: "page" }));

      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "/company",
          pageType: "_folder",
        }),
      ).rejects.toThrow("Slug already exists");
    });
  });

  it("should reject a page whose slug is used by a folder", async () => {
    await withTestDB(async ({ seed, action }) => {
      await seed("appPages", fake.appPages({ slug: "/company", pageType: "_folder" }));

      await expect(
        action(CreatePageAction).run({
          name: "Company",
          slug: "/company",
          pageType: "page",
        }),
      ).rejects.toThrow("Slug already exists");
    });
  });

  it("should allow a dynamic page on the slug of the folder that holds it", async () => {
    await withTestDB(async ({ seed, action }) => {
      const folder = await seed("appPages", fake.appPages({ slug: "/listing", pageType: "_folder" }));

      const result = await action(CreatePageAction).run({
        name: "Listing Details",
        slug: "/listing",
        pageType: "page",
        parent: folder.id,
        dynamic: true,
      });

      expect(result.page.slug).toBe("/listing");
    });
  });

  it("should throw error when slug already exists", async () => {
    await withTestDB(async ({ seed, action }) => {
      await seed("appPages", fake.appPages({ slug: "/duplicate-slug" }));

      await expect(
        action(CreatePageAction).run({
          name: "New Page",
          slug: "/duplicate-slug",
          pageType: "page",
        }),
      ).rejects.toThrow("Slug already exists");
    });
  });

  it("should create a page with parent relationship", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const parentPage = await seed("appPages", fake.appPages({ slug: "/parent" }));

      const result = await action(CreatePageAction).run({
        name: "Child Page",
        slug: "/parent/child",
        pageType: "default",
        parent: parentPage.id,
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.parent).toBe(parentPage.id);
      expect(page?.slug).toBe("/parent/child");
    });
  });

  it("should validate required fields", async () => {
    await withTestDB(async ({ action }) => {
      await expect(
        action(CreatePageAction).run({
          name: "",
          slug: "/test",
          pageType: "default",
        }),
      ).rejects.toThrow();
    });
  });
});
