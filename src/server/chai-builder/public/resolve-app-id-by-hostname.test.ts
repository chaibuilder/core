import { describe, expect, it } from "vitest";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { resolveAppIdByHostname } from "./resolve-app-id-by-hostname";

describe("resolveAppIdByHostname", () => {
  it("returns app id for a matching hostname", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appDomains", { app: TEST_APP_ID, domain: "example.com", subdomain: "unrelated-sub" });
      const cache = installMemoryPersistentCache();

      await expect(resolveAppIdByHostname("www.example.com")).resolves.toBe(TEST_APP_ID);
      expect(cache.wraps).toEqual([{ keyParts: ["hostname", "example.com"], tags: ["hostname-example.com"] }]);
    });
  });

  it("matches on subdomain and supports the draft (request-cache) path", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appDomains", { app: TEST_APP_ID, subdomain: "my-site.chaibuilder.xyz" });

      await expect(resolveAppIdByHostname("my-site.chaibuilder.xyz", { draft: true })).resolves.toBe(TEST_APP_ID);
    });
  });

  it("throws when no site matches the hostname", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appDomains", { app: TEST_APP_ID, domain: "example.com" });
      installMemoryPersistentCache();

      await expect(resolveAppIdByHostname("unknown.example.com")).rejects.toThrow(
        "No site found for hostname: unknown.example.com",
      );
    });
  });
});
