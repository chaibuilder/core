import { getChaiSiteDomainResolver } from "~/server/plugin-api/site-domains";
import { getCleanHostname } from "~/utils";
import { withPersistentCache, withRequestCache } from "./cache-utils";

async function fetchAppIdByCleanHostname(cleanHostname: string): Promise<string> {
  // The plugin that owns site domains registers the lookup; without one no hostname maps to a site.
  const resolver = getChaiSiteDomainResolver();
  let appId: string | null = null;
  let cause: unknown;
  try {
    appId = resolver ? await resolver.appIdByHostname(cleanHostname) : null;
  } catch (error) {
    cause = error;
  }

  if (!appId) {
    throw new Error(`No site found for hostname: ${cleanHostname}`, { cause });
  }

  return appId;
}

export type ResolveAppIdByHostnameOptions = {
  /** When true, uses per-request cache only (skips persistent cache). */
  draft?: boolean;
};

/**
 * Resolves a public site hostname (domain or subdomain) to a Chai app id.
 * Hostnames are normalized via {@link getCleanHostname} before lookup, then handed to the site
 * domain resolver a plugin registered (`registerChaiSiteDomainResolver`).
 */
export async function resolveChaiAppIdByHostname(
  hostname: string,
  options?: ResolveAppIdByHostnameOptions,
): Promise<string> {
  const cleanHostname = getCleanHostname(hostname);

  if (options?.draft) {
    return withRequestCache(fetchAppIdByCleanHostname, "resolveAppIdByHostname")(cleanHostname);
  }

  return withPersistentCache(
    fetchAppIdByCleanHostname,
    ["hostname", cleanHostname],
    [`hostname-${cleanHostname}`],
    false,
    "resolveAppIdByHostname",
  )(cleanHostname);
}
