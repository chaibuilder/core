import { describe, expect, it, vi } from "vitest";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { schema } from "~/tests/setup/test-db";
import { getPage } from "./get-page";

const published = <T>(fn: () => Promise<T>) => withRequestContext(fn, { draft: false });

const notFoundAdapter = () => {
  const pageNotFound = vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  installMemoryPersistentCache({ pageNotFound: pageNotFound as () => never });
  return pageNotFound;
};

// The public route caches a 404 but never a thrown error, so only a genuine miss may reach
// the framework's not-found signal — a failing database must surface as the error itself.
describe("getPage 404 vs failure", () => {
  it("404s a slug that matches no page", async () => {
    const pageNotFound = notFoundAdapter();

    await expect(published(() => getPage("/no-such-page"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(pageNotFound).toHaveBeenCalledOnce();
  });

  it("throws the query error, not a 404, when the page lookup fails", async () => {
    const pageNotFound = notFoundAdapter();

    await withTableUnavailable(schema.appPagesOnline, async () => {
      await expect(published(() => getPage("/about"))).rejects.toThrow("FAILED_TO_RESOLVE_PAGE");
    });
    expect(pageNotFound).not.toHaveBeenCalled();
  });

  // The slug may have a stored redirect: a 404 here would be cached for a path that redirects.
  it("throws the redirect lookup error, not a 404, when a missing page's redirect lookup fails", async () => {
    // The edition config registers the redirects plugin's request middleware.
    useTestChaiConfig();
    const pageNotFound = notFoundAdapter();

    await withTableUnavailable(schema.appRedirects, async () => {
      await expect(published(() => getPage("/no-such-page"))).rejects.toThrow("FAILED_TO_FETCH_REDIRECT");
    });
    expect(pageNotFound).not.toHaveBeenCalled();
  });
});
