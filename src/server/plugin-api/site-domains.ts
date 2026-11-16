/**
 * Process-global site domain resolver.
 *
 * Where a site's domain and subdomain are stored belongs to the plugin that owns domains, not to
 * core. Core's `resolveAppIdByHostname` and `getSiteDomains` keep their caching and errors and
 * ask the resolver registered here for the data. With no resolver registered, no hostname maps to
 * a site and no site has domains.
 *
 * Kept on `globalThis` like the action hooks, so the registration survives a plugin bundled in a
 * separate module graph from the public functions that read it.
 */

export type ChaiSiteDomains = {
  subdomain: string;
  domain: string | null;
  domainConfigured: boolean;
};

export type ChaiSiteDomainResolver = {
  /** The app whose domain or subdomain is `hostname` (already cleaned: no protocol, port or `www.`), or `null`. */
  appIdByHostname: (hostname: string) => Promise<string | null>;
  /** The domains of app `appId`, or `null` when it has none. */
  siteDomains: (appId: string) => Promise<ChaiSiteDomains | null>;
};

const _g = globalThis as typeof globalThis & {
  __chaiSiteDomainResolver?: ChaiSiteDomainResolver;
};

/** Installs the resolver. One per process: a later registration replaces the earlier one. */
export function registerChaiSiteDomainResolver(resolver: ChaiSiteDomainResolver): void {
  _g.__chaiSiteDomainResolver = resolver;
}

/** The registered resolver, if any. */
export function getChaiSiteDomainResolver(): ChaiSiteDomainResolver | undefined {
  return _g.__chaiSiteDomainResolver;
}

/** @internal Clears the resolver between unit tests. */
export function resetChaiSiteDomainResolverForTests(): void {
  _g.__chaiSiteDomainResolver = undefined;
}
