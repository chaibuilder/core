import * as coreSchema from "~/drizzle/schema.sqlite";
import type { ChaiDbSetup } from "~/db/core";
import { BUILTIN_PAGE_TYPES } from "./builtin-page-types";
import { DEFAULT_AI_CONFIG } from "./default-ai-config";
import { defaultGlobalDataProvider } from "./default-global-data";
import type { ResolvedChaiBuilderServerConfig } from "./types";

const DEFAULT_SDK_DB_PLACEHOLDER: ChaiDbSetup = {
  drizzle: null as unknown as ChaiDbSetup["drizzle"],
  schema: coreSchema,
};

/**
 * Server defaults without the builtin action registry. `config-registry` seeds from this one:
 * `builtin-chai-actions` instantiates every action class at module-eval time, and those action
 * modules read the registry, so importing the builtins from here would close an import cycle
 * (an action module loaded first sees its own class as undefined). `resolveChaiBuilderConfig`
 * merges the builtins in; see `default-server-config.ts` for the public constant that has them.
 */
export const CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG: ResolvedChaiBuilderServerConfig = {
  debugLevel: 0,
  globalDataProvider: defaultGlobalDataProvider,
  onPageNotFound: null,
  resolveDynamicTemplateTie: null,
  upstreamPageSource: null,
  pageTypes: BUILTIN_PAGE_TYPES,
  collections: [],
  chaiCollections: [],
  /** @deprecated mirror of `chaiCollections`. */
  repeaterData: [],
  blockDataProviders: {},
  trash: [],
  features: {
    trash: true,
    ai: true,
    copyPaste: true,
    darkMode: false,
    dataBinding: true,
    importHtml: true,
    importTheme: true,
    partialBlocks: true,
    gotoSettings: false,
    dragAndDrop: true,
    validateStructure: true,
    designTokens: true,
    resetSeoToDefault: false,
    pagesManager: true,
    chaiBranding: false,
    upstreamPages: false,
    siteLayout: false,
  },
  actions: {},
  builderActions: {},
  defaultRoleGrants: {},
  roles: undefined,
  ai: DEFAULT_AI_CONFIG,
  // Empty by design: every tab in the media manager is contributed by a plugin,
  // which seeds its own key when registered.
  mediaManager: {},
  db: DEFAULT_SDK_DB_PLACEHOLDER,
  schemaFragments: [],
  requestMiddlewares: [],
  setupHooks: [],
  contextResolver: undefined,
  transformSiteSettings: undefined,
};
