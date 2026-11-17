export type {
  ChaiDbConfigInput,
  ChaiBuilderServerConfigInput,
  ChaiMediaManagerConfig,
  ChaiMediaManagerConfigInput,
  ChaiServerFeatures,
  ChaiServerFeaturesInput,
  ChaiDefaultRoleGrants,
  ChaiRolesConfig,
  ChaiLogAiRequestArgs,
  ResolvedChaiAiGlobalConfig,
  ResolvedChaiBuilderServerConfig,
  ResolvedChaiDbConfig,
} from "~/types/server-config";
export type { ChaiDbSetup } from "~/types/db";

declare global {
  // Ambient stub: @cloudflare/workers-types is not a dependency, but drizzle-orm/d1
  // references the D1Database global, so declare a structural placeholder for it.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional empty ambient
  interface D1Database {}
}
