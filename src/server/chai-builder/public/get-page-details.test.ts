import { describe, expect, it } from "vitest";
import { getPageDetails } from "~/server/chai-builder/public/get-page-details";
import {
  pageDetailsCacheKey,
  pageDetailsCacheTags,
  pageDetailsTagsForMutation,
} from "~/server/chai-builder/public/page-details-cache";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { fake } from "~/tests/setup/fakers";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";

describe("page-details-cache", () => {
  it("builds cache key per app and page", () => {
    expect(pageDetailsCacheKey("app-1", "page-abc")).toEqual(["page-details-app-1-page-abc"]);
  });

  it("builds revalidation tags per page", () => {
    expect(pageDetailsCacheTags("page-abc").sort()).toEqual(["page-details-page-abc", "page-page-abc"].sort());
  });

  it("returns mutation tags for page details only", () => {
    expect(pageDetailsTagsForMutation("page-abc")).toEqual(["page-page-abc"]);
  });
});

const published = <T>(fn: () => Promise<T>) => withRequestContext(fn, { draft: false });

describe("getPageDetails", () => {
  it("reports PAGE_NOT_FOUND for an id with no row", async () => {
    installMemoryPersistentCache();

    await expect(published(() => getPageDetails("missing-page"))).rejects.toThrow("PAGE_NOT_FOUND");
  });

  it("throws the query error with its cause instead of PAGE_NOT_FOUND", async () => {
    installMemoryPersistentCache();

    const error = await withTableUnavailable(schema.appPagesOnline, () =>
      published(() => getPageDetails("page-1")).catch((e: unknown) => e),
    );

    expect((error as Error).message).toBe("FAILED_TO_FETCH_PAGE_DETAILS");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("does not persist the failure: details load once the table is back", async () => {
    await withTestDB(({ seed }) => seed("appPagesOnline", fake.appPagesOnline({ id: "page-1", seo: { title: "Hi" } })));
    installMemoryPersistentCache();

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(published(() => getPageDetails("page-1"))).rejects.toThrow("FAILED_TO_FETCH_PAGE_DETAILS");
    });

    await expect(published(() => getPageDetails("page-1"))).resolves.toMatchObject({ seo: { title: "Hi" } });
  });
});
