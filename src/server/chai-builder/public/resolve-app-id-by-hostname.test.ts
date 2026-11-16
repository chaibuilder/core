import { afterEach, describe, expect, it } from "vitest";
import {
  getChaiSiteDomainResolver,
  registerChaiSiteDomainResolver,
  resetChaiSiteDomainResolverForTests,
  type ChaiSiteDomainResolver,
} from "~/server/plugin-api/site-domains";
import { installMemoryPersistentCache } from "~/tests/setup/persistent-cache";
import { withRequestContext } from "~/tests/setup/request-context";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { getSiteDomains } from "./get-site-domains";
import { resolveAppIdByHostname } from "./resolve-app-id-by-hostname";

// Where domains are stored belongs to whichever plugin registers the site domain resolver. These
// tests install a Map-backed one, so they hold in every edition.
const editionResolver = getChaiSiteDomainResolver();

const SITES = [{ app: TEST_APP_ID, subdomain: "my-site.chaibuilder.xyz", domain: "example.com" }];

const lookups: string[] = [];
const memoryResolver: ChaiSiteDomainResolver = {
  async appIdByHostname(hostname) {
    lookups.push(hostname);
    return SITES.find((site) => site.domain === hostname || site.subdomain === hostname)?.app ?? null;
  },
  async siteDomains(appId) {
    const site = SITES.find((entry) => entry.app === appId);
    return site ? { subdomain: site.subdomain, domain: site.domain, domainConfigured: true } : null;
  },
};

const useResolver = (resolver: ChaiSiteDomainResolver | undefined) => {
  resetChaiSiteDomainResolverForTests();
  if (resolver) registerChaiSiteDomainResolver(resolver);
};

afterEach(() => {
  lookups.length = 0;
  useResolver(editionResolver);
});

describe("resolveAppIdByHostname", () => {
  it("cleans the hostname, asks the resolver and caches the answer per hostname", async () => {
    useResolver(memoryResolver);
    const cache = installMemoryPersistentCache();

    await expect(resolveAppIdByHostname("www.example.com")).resolves.toBe(TEST_APP_ID);
    await expect(resolveAppIdByHostname("www.example.com")).resolves.toBe(TEST_APP_ID);
    expect(lookups).toEqual(["example.com"]);
    expect(cache.wraps[0]).toEqual({ keyParts: ["hostname", "example.com"], tags: ["hostname-example.com"] });
  });

  it("supports the draft (request-cache) path", async () => {
    useResolver(memoryResolver);

    await expect(resolveAppIdByHostname("my-site.chaibuilder.xyz", { draft: true })).resolves.toBe(TEST_APP_ID);
  });

  it("throws when no site matches the hostname", async () => {
    useResolver(memoryResolver);
    installMemoryPersistentCache();

    await expect(resolveAppIdByHostname("unknown.example.com")).rejects.toThrow(
      "No site found for hostname: unknown.example.com",
    );
  });

  it("throws, keeping the cause, when the resolver fails", async () => {
    const failure = new Error("domains table unavailable");
    useResolver({ ...memoryResolver, appIdByHostname: () => Promise.reject(failure) });
    installMemoryPersistentCache();

    await expect(resolveAppIdByHostname("example.com")).rejects.toMatchObject({
      message: "No site found for hostname: example.com",
      cause: failure,
    });
  });

  it("finds no site when no plugin resolves domains", async () => {
    useResolver(undefined);
    installMemoryPersistentCache();

    await expect(resolveAppIdByHostname("example.com")).rejects.toThrow("No site found for hostname: example.com");
  });
});

describe("getSiteDomains", () => {
  it("returns the resolver's domains for the request's app", async () => {
    useResolver(memoryResolver);

    await expect(withRequestContext(() => getSiteDomains())).resolves.toEqual({
      subdomain: "my-site.chaibuilder.xyz",
      domain: "example.com",
      domainConfigured: true,
    });
  });

  it("throws SITE_DOMAINS_NOT_FOUND when no plugin resolves domains", async () => {
    useResolver(undefined);

    await expect(withRequestContext(() => getSiteDomains())).rejects.toThrow("SITE_DOMAINS_NOT_FOUND");
  });
});
