import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { UpdatePageAction } from "./update-page";

describe("UpdatePageAction - Dynamic Sync Integration", () => {
  describe.each(["slug", "parent"] as const)("dynamic transitions with a %s change", (change) => {
    it.each([true, false])("allows sharing a base slug when switching dynamic to %s", async (dynamic) => {
      await withTestDB(async ({ db, seed, action }) => {
        const listing = await seed("appPages", fake.appPages({ slug: "/offres-manufacturier", dynamic: !dynamic }));
        const page = await seed("appPages", fake.appPages({ slug: "/promotion-template", dynamic: !dynamic }));

        await action(UpdatePageAction).run({
          id: page.id,
          slug: listing.slug,
          dynamic,
          ...(change === "parent" ? { parent: listing.id } : {}),
        });

        const updatedPage = await getPageById(db, page.id);
        expect(updatedPage?.slug).toBe(listing.slug);
        expect(updatedPage?.dynamic).toBe(dynamic);
        expect(updatedPage?.parent ?? null).toBe(change === "parent" ? listing.id : null);
        expect((await getPageById(db, listing.id))?.dynamic).toBe(!dynamic);
      });
    });

    it.each([true, false])("rejects an existing slug with the requested dynamic value %s", async (dynamic) => {
      await withTestDB(async ({ db, seed, action }) => {
        const existing = await seed("appPages", fake.appPages({ slug: "/offres-manufacturier", dynamic }));
        const page = await seed("appPages", fake.appPages({ slug: "/promotion-template", dynamic: !dynamic }));

        await expect(
          action(UpdatePageAction).run({
            id: page.id,
            slug: existing.slug,
            dynamic,
            ...(change === "parent" ? { parent: existing.id } : {}),
          }),
        ).rejects.toMatchObject({ code: "SLUG_ALREADY_EXISTS" });

        const unchangedPage = await getPageById(db, page.id);
        expect(unchangedPage?.slug).toBe("/promotion-template");
        expect(unchangedPage?.dynamic).toBe(!dynamic);
        expect(unchangedPage?.parent ?? null).toBeNull();
      });
    });
  });

  it("uses the requested dynamic value for language variants when changing parent", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const listing = await seed("appPages", fake.appPages({ slug: "/offres-manufacturier" }));
      const translatedListing = await seed(
        "appPages",
        fake.appPages({ slug: "/en/manufacturer-offers", lang: "en", primaryPage: listing.id }),
      );
      const page = await seed("appPages", fake.appPages({ slug: "/promotion-template" }));
      const translatedPage = await seed(
        "appPages",
        fake.appPages({ slug: "/en/promotion-template", lang: "en", primaryPage: page.id }),
      );
      const translatedTargetSlug = `${translatedListing.slug}/promotion-template`;
      await seed("appPages", fake.appPages({ slug: translatedTargetSlug }));

      await action(UpdatePageAction).run({
        id: page.id,
        slug: listing.slug,
        parent: listing.id,
        dynamic: true,
        dynamicSlugCustom: "{{slug}}",
      });

      const updatedTranslation = await getPageById(db, translatedPage.id);
      expect(updatedTranslation?.slug).toBe(translatedTargetSlug);
      expect(updatedTranslation?.dynamic).toBe(true);
      expect(updatedTranslation?.dynamicSlugCustom).toBe("{{slug}}");
    });
  });

  it.each([true, false])("rejects converging language variant slugs when switching dynamic to %s", async (dynamic) => {
    await withTestDB(async ({ db, seed, action }) => {
      const parent = await seed("appPages", fake.appPages({ slug: "/parent" }));
      const page = await seed(
        "appPages",
        fake.appPages({ slug: "/parent/template", parent: parent.id, dynamic: !dynamic }),
      );
      const variants = [];
      for (const lang of ["en", "fr"]) {
        await seed("appPages", fake.appPages({ slug: `/${lang}/parent`, lang, primaryPage: parent.id }));
        variants.push(
          await seed(
            "appPages",
            fake.appPages({ slug: `/${lang}/contact`, lang, primaryPage: page.id, dynamic: !dynamic }),
          ),
        );
      }

      await expect(action(UpdatePageAction).run({ id: page.id, parent: null, dynamic })).rejects.toMatchObject({
        code: "SLUG_ALREADY_EXISTS",
      });

      const unchangedPage = await getPageById(db, page.id);
      expect(unchangedPage?.slug).toBe(page.slug);
      expect(unchangedPage?.parent).toBe(parent.id);
      expect(unchangedPage?.dynamic).toBe(!dynamic);
      for (const variant of variants) {
        const unchangedVariant = await getPageById(db, variant.id);
        expect(unchangedVariant?.slug).toBe(variant.slug);
        expect(unchangedVariant?.dynamic).toBe(!dynamic);
      }
    });
  });

  it("should sync dynamic and dynamicSlugCustom fields to secondary pages", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange
      const primaryPage = await seed("appPages", fake.appPages({ dynamic: false }));
      const secondaryPage = await seed("appPages", fake.appPages({ primaryPage: primaryPage.id, dynamic: false }));

      const payload = {
        id: primaryPage.id,
        dynamic: true,
        dynamicSlugCustom: "custom-slug-field",
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert
      expect(result.page).toBeDefined();

      const updatedPrimary = await getPageById(db, primaryPage.id);
      expect(updatedPrimary).not.toBeNull();
      expect(updatedPrimary?.dynamic).toBe(true);
      expect(updatedPrimary?.dynamicSlugCustom).toBe("custom-slug-field");

      const updatedSecondary = await getPageById(db, secondaryPage.id);
      expect(updatedSecondary).not.toBeNull();
      expect(updatedSecondary?.dynamic).toBe(true);
      expect(updatedSecondary?.dynamicSlugCustom).toBe("custom-slug-field");
    });
  });
});
