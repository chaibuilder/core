import { getChaiSiteDomainResolver, type ChaiSiteDomains } from "~/server/plugin-api/site-domains";
import { getInitializedState } from "../state";
import { withRequestCache } from "./cache-utils";

export type SiteDomains = ChaiSiteDomains;

// Stable function reference for caching - defined once at module level
async function fetchSiteDomains(appId: string): Promise<SiteDomains> {
  // The plugin that owns site domains registers the lookup; without one no site has domains.
  const resolver = getChaiSiteDomainResolver();
  let data: SiteDomains | null = null;
  let error: unknown;
  try {
    data = resolver ? await resolver.siteDomains(appId) : null;
  } catch (cause) {
    error = cause;
  }

  if (error || !data?.subdomain) {
    console.error("Error fetching site domains", error);
    throw new Error("SITE_DOMAINS_NOT_FOUND");
  }

  return data;
}

export const getSiteDomains = async (): Promise<SiteDomains> => {
  const state = getInitializedState();
  if (!state.appId) {
    throw new Error("APP_ID_NOT_FOUND");
  }
  //TODO: Change to persistent cache once invalidation is implemented
  return await withRequestCache(fetchSiteDomains)(state.appId!);
};
