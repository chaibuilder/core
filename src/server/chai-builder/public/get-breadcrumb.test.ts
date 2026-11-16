import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { fake } from "~/tests/setup/fakers";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getBreadcrumb } from "./get-breadcrumb";

const published = <T>(fn: () => Promise<T>) => withRequestContext(fn, { draft: false });

describe("getBreadcrumb", () => {
  it("reports PAGE_NOT_FOUND for a page that is not in the app", async () => {
    installMemoryPersistentCache();

    await expect(published(() => getBreadcrumb("missing-page"))).rejects.toThrow("PAGE_NOT_FOUND");
  });

  // An empty page list would read as "page not in the app" and 404 a page that exists.
  it("throws the query error with its cause instead of PAGE_NOT_FOUND", async () => {
    installMemoryPersistentCache();

    const error = await withTableUnavailable(schema.appPagesOnline, () =>
      published(() => getBreadcrumb("page-1")).catch((e: unknown) => e),
    );

    expect((error as Error).message).toBe("FAILED_TO_FETCH_BREADCRUMB_PAGES");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("does not persist the failure: the breadcrumb builds once the table is back", async () => {
    await withTestDB(({ seed }) =>
      seed("appPagesOnline", fake.appPagesOnline({ id: "page-1", name: "About", slug: "/about", lang: "en" })),
    );
    installMemoryPersistentCache();

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(published(() => getBreadcrumb("page-1"))).rejects.toThrow("FAILED_TO_FETCH_BREADCRUMB_PAGES");
    });

    await expect(published(() => getBreadcrumb("page-1"))).resolves.toEqual([
      { id: "page-1", name: "About", slug: "/about", lang: "en" },
    ]);
  });
});
