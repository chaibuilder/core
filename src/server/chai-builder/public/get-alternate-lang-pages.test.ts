import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getAlternateLangPages } from "./get-alternate-lang-pages";

// A French primary VDP (empty `lang` column) and its English language variant, published.
// The request runs with `lang: "en"` / state.fallbackLang "en" — the WRONG placeholder the
// metadata request path actually carries. Alternates must be labeled from the `fallbackLang`
// argument (resolved from real site settings), never from state.
async function seedGroup(seedMany: Parameters<Parameters<typeof withTestDB>[0]>[0]["seedMany"]) {
  await seedMany("appPagesOnline", [
    { id: "fr-1", name: "FR", slug: "/inventaire-neuf", lang: "", dynamic: true, primaryPage: null },
    { id: "en-1", name: "EN", slug: "/en/new-inventory", lang: "en", dynamic: true, primaryPage: "fr-1" },
    // Unrelated page: not part of the language group.
    { id: "other", name: "Other", slug: "/other", lang: "", dynamic: false, primaryPage: null },
  ]);
}

describe("getAlternateLangPages", () => {
  it("labels the empty-lang primary with the passed site fallback, not state.fallbackLang", async () => {
    await withTestDB(async ({ seedMany, inRequest }) => {
      await seedGroup(seedMany);
      installMemoryPersistentCache();

      // Request is the EN variant → the FR primary is its only alternate. With the site
      // fallback "fr" it must be labeled `fr`, never `en` (which would collide with and
      // overwrite the EN page's own self-hreflang).
      const alts = await inRequest(() => getAlternateLangPages("fr-1", "en-1", "fr"), { draft: false, lang: "en" });
      expect(alts).toEqual([
        { id: "fr-1", name: "FR", slug: "/inventaire-neuf", lang: "fr", dynamic: true, primaryLang: true },
      ]);
    });
  });

  it("excludes only the requested page by id", async () => {
    await withTestDB(async ({ seedMany, inRequest }) => {
      await seedGroup(seedMany);
      installMemoryPersistentCache();

      // Request is the FR primary → its only alternate is the EN variant (labeled by its
      // own explicit lang).
      const alts = await inRequest(() => getAlternateLangPages("fr-1", "fr-1", "fr"), { draft: false, lang: "en" });
      expect(alts).toEqual([
        { id: "en-1", name: "EN", slug: "/en/new-inventory", lang: "en", dynamic: true, primaryLang: false },
      ]);
    });
  });

  // An empty group would ship the page with no hreflang alternates, persisted with no expiry
  // until the page group is republished.
  it("throws the query error with its cause instead of returning no alternates", async () => {
    installMemoryPersistentCache();

    const error = await withTableUnavailable(schema.appPagesOnline, () =>
      withRequestContext(() => getAlternateLangPages("fr-1", "en-1", "fr"), { draft: false }).catch(
        (e: unknown) => e,
      ),
    );

    expect((error as Error).message).toBe("FAILED_TO_FETCH_ALTERNATE_PAGES");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("does not persist the failure: the alternates return once the table is back", async () => {
    await withTestDB(async ({ seedMany, inRequest }) => {
      await seedGroup(seedMany);
      installMemoryPersistentCache();

      const alternates = () => inRequest(() => getAlternateLangPages("fr-1", "en-1", "fr"), { draft: false });

      await withTableUnavailable(schema.appPagesOnline, async () => {
        await expect(alternates()).rejects.toThrow("FAILED_TO_FETCH_ALTERNATE_PAGES");
      });

      await expect(alternates()).resolves.toEqual([
        { id: "fr-1", name: "FR", slug: "/inventaire-neuf", lang: "fr", dynamic: true, primaryLang: true },
      ]);
    });
  });
});
