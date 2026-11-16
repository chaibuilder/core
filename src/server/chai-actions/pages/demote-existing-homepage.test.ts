import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { CreatePageAction } from "./create-page";
import { UpdatePageAction } from "./update-page";

const HOMEPAGE_SLUG_PATTERN = /^\/homepage-[0-9a-z]{4}$/;

// Replacing an existing homepage is gated on pages:update + pages:unpublish
const ADMIN = { userAccess: { permissions: ["*"] } } as any;

describe("Homepage demotion - Integration", () => {
  it("should demote the existing homepage when a new one is created", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      await seed("appPagesOnline", fake.appPages({ id: oldHome.id, slug: "/", pageType: "page", online: true }));

      const result = await action(CreatePageAction, ADMIN).run({
        name: "New Home",
        slug: "/",
        pageType: "page",
      });

      expect(result.page.slug).toBe("/");

      // The old homepage was renamed and unpublished
      const demoted = await getPageById(db, oldHome.id);
      expect(demoted?.slug).toMatch(HOMEPAGE_SLUG_PATTERN);
      expect(demoted?.online).toBe(false);

      // Its live row is gone
      const onlineRows = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, oldHome.id),
      });
      expect(onlineRows).toHaveLength(0);

      // Cache tags cover the demoted page, including its id -> slug resolver
      // entry (its live row was deleted)
      expect(result.tags).toContain(`page-${oldHome.id}`);
      expect(result.tags).toContain(`page-slug:${oldHome.id}`);
    });
  });

  it("should move and unpublish language variants of the demoted homepage", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      const frHome = await seed(
        "appPages",
        fake.appPages({ slug: "/fr", lang: "fr", pageType: "page", primaryPage: oldHome.id, online: true }),
      );
      await seed("appPagesOnline", fake.appPages({ id: oldHome.id, slug: "/", pageType: "page" }));
      await seed(
        "appPagesOnline",
        fake.appPages({ id: frHome.id, slug: "/fr", lang: "fr", pageType: "page", primaryPage: oldHome.id }),
      );

      await action(CreatePageAction, ADMIN).run({
        name: "New Home",
        slug: "/",
        pageType: "page",
      });

      const demoted = await getPageById(db, oldHome.id);
      const demotedVariant = await getPageById(db, frHome.id);
      expect(demoted?.slug).toMatch(HOMEPAGE_SLUG_PATTERN);
      expect(demotedVariant?.slug).toBe(`/fr${demoted?.slug}`);
      expect(demotedVariant?.online).toBe(false);

      const onlineVariantRows = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, frHome.id),
      });
      expect(onlineVariantRows).toHaveLength(0);
    });
  });

  it("should create a homepage without demotion when no page owns '/'", async () => {
    await withTestDB(async ({ db, action }) => {
      const result = await action(CreatePageAction).run({
        name: "Home",
        slug: "/",
        pageType: "page",
      });

      const page = await getPageById(db, result.page.id);
      expect(page?.slug).toBe("/");
    });
  });

  it("should reject '/' for non-'page' page types, child pages and language rows on create", async () => {
    await withTestDB(async ({ seed, action }) => {
      await expect(action(CreatePageAction).run({ name: "Blog Home", slug: "/", pageType: "blog" })).rejects.toThrow(
        "Only a root-level page of type 'page' can be the homepage",
      );

      const parent = await seed("appPages", fake.appPages({ slug: "/parent", pageType: "page" }));
      await expect(
        action(CreatePageAction).run({ name: "Child Home", slug: "/", pageType: "page", parent: parent.id }),
      ).rejects.toThrow("Only a root-level page of type 'page' can be the homepage");

      // Empty-string relationship ids are not root-level primaries
      await expect(
        action(CreatePageAction).run({ name: "Empty Parent", slug: "/", pageType: "page", parent: "" }),
      ).rejects.toThrow("Only a root-level page of type 'page' can be the homepage");

      const primary = await seed("appPages", fake.appPages({ slug: "/some-page", pageType: "page" }));
      await expect(
        action(CreatePageAction).run({
          name: "Lang Home",
          slug: "/",
          pageType: "page",
          lang: "fr",
          primaryPage: primary.id,
        }),
      ).rejects.toThrow("Only a root-level page of type 'page' can be the homepage");
    });
  });

  it("should demote the existing homepage when another page is promoted via update", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      await seed("appPagesOnline", fake.appPages({ id: oldHome.id, slug: "/", pageType: "page" }));
      const page = await seed("appPages", fake.appPages({ slug: "/about", pageType: "page" }));

      await action(UpdatePageAction, ADMIN).run({ id: page.id, slug: "/" });

      const promoted = await getPageById(db, page.id);
      expect(promoted?.slug).toBe("/");

      const demoted = await getPageById(db, oldHome.id);
      expect(demoted?.slug).toMatch(HOMEPAGE_SLUG_PATTERN);
      expect(demoted?.online).toBe(false);

      const onlineRows = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, oldHome.id),
      });
      expect(onlineRows).toHaveLength(0);
    });
  });

  it("should move descendants of the demoted homepage with it", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      const child = await seed(
        "appPages",
        fake.appPages({ slug: "/team", pageType: "page", parent: oldHome.id, online: true }),
      );
      await seed("appPagesOnline", fake.appPages({ id: oldHome.id, slug: "/", pageType: "page" }));
      await seed("appPagesOnline", fake.appPages({ id: child.id, slug: "/team", pageType: "page" }));

      const result = await action(CreatePageAction, ADMIN).run({ name: "New Home", slug: "/", pageType: "page" });

      const demoted = await getPageById(db, oldHome.id);
      const movedChild = await getPageById(db, child.id);
      expect(movedChild?.slug).toBe(`${demoted?.slug}/team`);
      // The child stays published — only the homepage itself is unpublished —
      // and its live row follows the rename
      expect(movedChild?.online).toBe(true);
      const onlineChild = await db.query.appPagesOnline.findMany({
        where: eq(schema.appPagesOnline.id, child.id),
      });
      expect(onlineChild).toHaveLength(1);
      expect(onlineChild[0]?.slug).toBe(`${demoted?.slug}/team`);
      expect(result.tags).toContain(`page-slug:${child.id}`);
    });
  });

  it("should move the promoted page's language variants to their homepage routes", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      await seed("appPages", fake.appPages({ slug: "/fr", lang: "fr", pageType: "page", primaryPage: oldHome.id }));
      const page = await seed("appPages", fake.appPages({ slug: "/about", pageType: "page" }));
      const frVariant = await seed(
        "appPages",
        fake.appPages({ slug: "/fr/about", lang: "fr", pageType: "page", primaryPage: page.id }),
      );

      await action(UpdatePageAction, ADMIN).run({ id: page.id, slug: "/" });

      const promoted = await getPageById(db, page.id);
      expect(promoted?.slug).toBe("/");
      const movedVariant = await getPageById(db, frVariant.id);
      expect(movedVariant?.slug).toBe("/fr");
    });
  });

  it("should keep child slugs well-formed when the homepage is renamed to a normal slug", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const home = await seed("appPages", fake.appPages({ slug: "/", pageType: "page" }));
      const child = await seed("appPages", fake.appPages({ slug: "/team", pageType: "page", parent: home.id }));

      await action(UpdatePageAction, ADMIN).run({ id: home.id, slug: "/home" });

      const renamed = await getPageById(db, home.id);
      expect(renamed?.slug).toBe("/home");
      const movedChild = await getPageById(db, child.id);
      expect(movedChild?.slug).toBe("/home/team");
    });
  });

  it("should rewrite child slugs without a double slash when their parent becomes the homepage", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const parent = await seed("appPages", fake.appPages({ slug: "/about", pageType: "page" }));
      const child = await seed("appPages", fake.appPages({ slug: "/about/team", pageType: "page", parent: parent.id }));

      await action(UpdatePageAction, ADMIN).run({ id: parent.id, slug: "/" });

      const promoted = await getPageById(db, parent.id);
      expect(promoted?.slug).toBe("/");

      const movedChild = await getPageById(db, child.id);
      expect(movedChild?.slug).toBe("/team");
    });
  });

  it("should require update + unpublish permissions to replace an existing homepage", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const oldHome = await seed("appPages", fake.appPages({ slug: "/", pageType: "page", online: true }));
      await seed("appPagesOnline", fake.appPages({ id: oldHome.id, slug: "/", pageType: "page" }));

      const CREATE_ONLY = { userAccess: { permissions: ["pages:create"] } } as any;
      await expect(
        action(CreatePageAction, CREATE_ONLY).run({ name: "New Home", slug: "/", pageType: "page" }),
      ).rejects.toThrow("Replacing the current homepage requires permissions");

      const page = await seed("appPages", fake.appPages({ slug: "/about", pageType: "page" }));
      const UPDATE_ONLY = { userAccess: { permissions: ["pages:update"] } } as any;
      await expect(action(UpdatePageAction, UPDATE_ONLY).run({ id: page.id, slug: "/" })).rejects.toThrow(
        "Replacing the current homepage requires permission",
      );

      // The current homepage was left untouched by the rejected attempts
      const untouched = await getPageById(db, oldHome.id);
      expect(untouched?.slug).toBe("/");
      expect(untouched?.online).toBe(true);
    });
  });

  it("should reject updates that would give '/' to an invalid page", async () => {
    await withTestDB(async ({ seed, action }) => {
      // A child page cannot be updated to "/"
      const parent = await seed("appPages", fake.appPages({ slug: "/parent", pageType: "page" }));
      const child = await seed(
        "appPages",
        fake.appPages({ slug: "/parent/child", pageType: "page", parent: parent.id }),
      );
      await expect(action(UpdatePageAction).run({ id: child.id, slug: "/" })).rejects.toThrow(
        "Only a root-level page of type 'page' can be the homepage",
      );

      // The homepage cannot change to another page type while keeping "/"
      const home = await seed("appPages", fake.appPages({ slug: "/", pageType: "page" }));
      await expect(action(UpdatePageAction).run({ id: home.id, pageType: "blog" })).rejects.toThrow(
        "Only a root-level page of type 'page' can be the homepage",
      );
    });
  });
});
