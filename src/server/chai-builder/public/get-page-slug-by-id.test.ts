import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { fake } from "~/tests/setup/fakers";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { resolvePageSlugs } from "./get-page-slug-by-id";

// The request state seeds fallbackLang "en": "en" takes the default-language query, "fr" the translated one.
const resolveOnline = (ids: string[], lang: string) =>
  withRequestContext(() => resolvePageSlugs(ids, lang), { draft: false, lang });

async function seedOnlinePages() {
  await withTestDB(({ seedMany }) =>
    seedMany("appPagesOnline", [
      fake.appPagesOnline({ id: "about", slug: "/about" }),
      fake.appPagesOnline({ id: "contact", slug: "/contact" }),
    ]),
  );
  installMemoryPersistentCache();
}

// One linked id goes through resolvePageSlug, two or more through the batch query; each has
// a default-language and a translated query. A failed lookup must never read as "no page":
// every link on the page would render as "#", and the batch result is persisted with no expiry.
describe.each([
  { path: "single id", ids: ["about"], message: "FAILED_TO_RESOLVE_PAGE_SLUG" },
  { path: "batch", ids: ["about", "contact"], message: "FAILED_TO_RESOLVE_PAGE_SLUGS" },
])("resolvePageSlugs query failure ($path)", ({ ids, message }) => {
  const resolved = new Map([
    ["about", "/about"],
    ["contact", "/contact"],
  ]);
  const expected = new Map(ids.map((id) => [id, resolved.get(id)!]));

  it.each(["en", "fr"])("throws the query error with its cause instead of resolving no slugs (%s)", async (lang) => {
    installMemoryPersistentCache();

    const error = await withTableUnavailable(schema.appPagesOnline, () =>
      resolveOnline(ids, lang).catch((e: unknown) => e),
    );

    expect((error as Error).message).toBe(message);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it.each(["en", "fr"])("does not persist the failure: the slugs resolve once the table is back (%s)", async (lang) => {
    await seedOnlinePages();

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(resolveOnline(ids, lang)).rejects.toThrow(message);
    });

    await expect(resolveOnline(ids, lang)).resolves.toEqual(expected);
  });
});

describe("resolvePageSlugs missing target", () => {
  // A deleted or unpublished link target is not an error: its link renders as "#".
  it.each(["en", "fr"])("resolves no slug for a single id with no row (%s)", async (lang) => {
    await seedOnlinePages();

    await expect(resolveOnline(["deleted"], lang)).resolves.toEqual(new Map());
  });

  it.each(["en", "fr"])("resolves the ids that exist and skips the missing one in a batch (%s)", async (lang) => {
    await seedOnlinePages();

    await expect(resolveOnline(["about", "deleted"], lang)).resolves.toEqual(new Map([["about", "/about"]]));
  });
});
