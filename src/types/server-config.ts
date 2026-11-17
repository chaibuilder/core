import type { ImageModel, LanguageModel } from "ai";
import type { AIModel } from "~/builder/pages/panels/ai-panel/ai-models-context";
import type { ChaiMediaUploadsConfig } from "~/constants/ASSET_TYPES";
import type { CreditStatus } from "~/types/credits";
import type { ChaiAction } from "~/types/chai-action";
import type {
  ChaiBlockDataProvider,
  ChaiRepeaterDataEntry,
  ChaiContextResolver,
  ChaiDebugLevel,
  ChaiGlobalDataProvider,
  ChaiDynamicTemplateTieHandler,
  ChaiPageNotFoundHandler,
  ChaiUpstreamPageSource,
  ChaiPageTypeEntry,
  ChaiTrashEntry,
} from "~/types/chaibuilder-config";
import type { ChaiCollectionEntry } from "~/types/deprecated";
import type { ChaiDbSetup } from "~/types/db";
import type { ChaiDesignSystemFeature } from "~/types/design-system";
import type { ChaiRequestMiddlewareEntry, ChaiSchemaFragment, ChaiServerPlugin, ChaiSetupHook } from "~/types/plugin";
import type { ChaiRolesAndPermissions } from "~/types/rbac";

export type ChaiLogAiRequestArgs = {
  userId: string;
  startTime: number;
  response: Record<string, any>;
  error?: string | null;
  prompt: string;
  model: string;
  appId: string;
  creditStatus?: CreditStatus | null;
};

export type { ChaiDbSetup };

/** Result of `createPostgresDb`, `createLibsqlDb`, etc. — pass to `buildChaiBuilderConfig({ db })`. */
export type ChaiDbConfigInput = ChaiDbSetup;

export type ResolvedChaiDbConfig = ChaiDbSetup;

/**
 * An AI SDK provider instance (structural). Any object exposing the AI SDK model
 * factory methods qualifies — e.g. the value returned by `createOpenRouter`,
 * `createWorkersAI`, `createOpenAICompatible`, a custom gateway, etc.
 */
export type ChaiAiSdkProvider = {
  languageModel: (modelId: string) => unknown;
  imageModel?: (modelId: string) => unknown;
};

/** An AI SDK provider, or a (possibly async) factory that builds one. */
export type ChaiAiProvider = ChaiAiSdkProvider | (() => ChaiAiSdkProvider | Promise<ChaiAiSdkProvider>);

/**
 * A pluggable AI provider adapter. ChaiBuilder installs the first plugin whose
 * `isConfigured()` returns true as the AI SDK default provider, so every model
 * request is routed through it. Adapters lazily import their (peer-dependency)
 * SDK package inside `createProvider`, so an unused provider costs nothing.
 */
export type ChaiAiProviderPlugin = {
  /** Stable id, e.g. "openrouter", "cloudflare", "huggingface". */
  id: string;
  /** Human-readable label used in logs. */
  label?: string;
  /**
   * The optional peer package `createProvider` imports, e.g.
   * `"@openrouter/ai-sdk-provider"`. Named in the log when initialisation fails,
   * so "install this to enable it" is actionable.
   */
  packageName?: string;
  /** True when this provider's credentials/config are present (usually an env-var check). */
  isConfigured: () => boolean;
  /** Lazily build the AI SDK provider. Should dynamic-import the peer package. */
  createProvider: () => ChaiAiSdkProvider | Promise<ChaiAiSdkProvider>;
  /**
   * Optional cache key (e.g. the API key). When it changes the provider is
   * rebuilt; when it is stable the installed provider is reused across requests.
   */
  fingerprint?: () => string | undefined;
};

export type ResolvedChaiAiGlobalConfig = {
  models: AIModel[];
  defaultModelId: string;
  /** Model key -> AI action names it handles, e.g. `{ "google/gemini-3-flash": ["AI_GENERATE_THEME"] }`. */
  actionModels: Record<string, string[]>;
  resolveModel: (
    modelKey: string,
    aiActionName: string,
  ) => { model: LanguageModel | ImageModel; providerOptions?: Record<string, unknown> } | undefined;
  /**
   * Explicit AI SDK provider (instance or factory). Highest priority: when set it
   * overrides both the built-in gateway and any auto-detected provider plugins.
   * Use this to plug in any AI SDK provider (Cloudflare Workers AI, Hugging Face,
   * Bedrock, a custom gateway, …) without shipping a dedicated adapter.
   */
  provider?: ChaiAiProvider;
  /**
   * Custom provider plugins, tried ahead of the built-ins and auto-activated by
   * their `isConfigured()`. Lets an app add "install package + set env var"
   * providers of its own.
   */
  providers?: ChaiAiProviderPlugin[];
  logging: {
    logger: (params: ChaiLogAiRequestArgs) => void | Promise<void>;
    clientId: string | null;
  };
};

/**
 * Resolves the global role map at request time. Installed by a roles plugin
 * (not meant to be hand-written in app config). `null` = "nothing stored,
 * fall back to the built-in defaults".
 */
export type ChaiRolesLoader = () => Promise<ChaiRolesAndPermissions | null>;

/**
 * How ChaiBuilder should resolve roles and permissions.
 * - `undefined`                  → built-in default roles (`DEFAULT_ROLE_MAPS` + plugin
 *                                  `defaultRoleGrants`), no DB hit
 * - `{ source: 'custom' }`       → DB-managed roles; requires the roles plugin, which
 *                                  swaps in its loader. Without the plugin this falls
 *                                  back to the defaults (with a one-time warning).
 * - `ChaiRolesLoader`            → plugin-installed engine; awaited at resolution time
 * - `ChaiRolesAndPermissions`    → use the provided static map directly
 */
export type ChaiRolesConfig = { source: "custom" } | ChaiRolesLoader | ChaiRolesAndPermissions;

/**
 * Role name -> additional permission keys (wildcards allowed). Additive only:
 * plugins seed grants for their own keys into the built-in default roles.
 * Applied exclusively when roles resolve to the `DEFAULT_ROLE_MAPS` fallback —
 * an explicit role map or DB-managed roles are never overlaid (an app wanting
 * different grants owns its role source).
 */
export type ChaiDefaultRoleGrants = Record<string, string[]>;

/**
 * Media manager configuration: which tabs the manager shows and what each of them offers.
 *
 * Deliberately empty in the core — the media manager itself reads nothing from it.
 * Plugins that add a tab declare their own key by augmenting
 * {@link ChaiPluginMediaManagerConfig}:
 *
 * ```ts
 * declare module "~/types/server-config" {
 *   interface ChaiPluginMediaManagerConfig {
 *     searchImages?: { enabled: boolean; providers: ChaiMediaManagerProvider[] };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- open for plugin augmentation
export interface ChaiPluginMediaManagerConfig {}

/** Media manager tabs. Plugin-owned keys live in {@link ChaiPluginMediaManagerConfig}. */
export interface ChaiMediaManagerConfig extends ChaiPluginMediaManagerConfig {
  /**
   * Accepted upload categories and per-category size caps. Set by whichever
   * media backend is registered, from its `uploads` option; unset means the
   * defaults in `~/constants/ASSET_TYPES`.
   */
  uploads?: ChaiMediaUploadsConfig;
}

/**
 * Feature flags owned by plugins. A plugin declares its flag by augmenting this
 * interface, so the key exists in the config type exactly when the plugin is
 * part of the program:
 *
 * ```ts
 * declare module "~/types/server-config" {
 *   interface ChaiPluginFeatures {
 *     redirects?: boolean;
 *   }
 * }
 * ```
 *
 * Plugin-declared keys are optional: absent means the plugin is not registered.
 * Registering the plugin enables the feature; its options carry the config.
 * These keys are NOT settable via the app `features` input — see
 * {@link ChaiServerFeaturesInput}.
 */
export interface ChaiPluginFeatures {
  /**
   * The site design system (DESIGN.md-style rules, design checks, theme tools for agents).
   * Set by the MCP plugin's `designSystem` option. Declared here rather than by augmentation
   * so core (the builder's AI flows, when they adopt it) can read the same flag. Absent or
   * `enabled: false` means every existing flow is unchanged.
   */
  designSystem?: ChaiDesignSystemFeature;
}

/**
 * Server-backed builder features. Only features the core itself implements are
 * declared here; plugin-owned flags live in {@link ChaiPluginFeatures}.
 */
export interface ChaiServerFeatures extends ChaiPluginFeatures {
  /** Trash panel and soft-delete flows. Defaults from configured trash entities. */
  trash: boolean;
  /**
   * Every builder AI feature: the AI panel, Ask AI on the canvas and in the style panel,
   * AI theme, SEO, alt-text and image tools. Off also refuses every model-calling action
   * on the server. MCP tools are unaffected. On whenever any AI models are configured
   * (the default config ships some); set `features: { ai: false }` to turn AI off.
   */
  ai: boolean;
  /** Copy/paste of blocks and classes. */
  copyPaste: boolean;
  /** Dark mode toggle in the canvas top bar and theme panel. */
  darkMode: boolean;
  /** Data binding widgets and the canvas binding switcher. */
  dataBinding: boolean;
  /** Import-HTML entry in the add-blocks panel. */
  importHtml: boolean;
  /** Import-theme entry in the theme panel. */
  importTheme: boolean;
  /** Partials in the editor: "Create partial" in the block menu, the pages manager's Partials "Create" button, and the Add Blocks partials tab and search results. */
  partialBlocks: boolean;
  /** "Go to settings" on the block floating actions. */
  gotoSettings: boolean;
  /** Drag and drop on the canvas and add-blocks panel. */
  dragAndDrop: boolean;
  /** Live structure-rule validation while editing. */
  validateStructure: boolean;
  /** Design token picker in the classes panel. */
  designTokens: boolean;
  /** "Reset to default" action in the SEO panel. */
  resetSeoToDefault: boolean;
  /** Pages manager sheet and its top bar trigger. */
  pagesManager: boolean;
  /** ChaiBuilder name, version and docs links in the editor (console banner, page-type help). Off for white-label hosts. */
  chaiBranding: boolean;
  /** Linked pages that render a host-supplied upstream page (`upstream` / `useUpstream` page columns). */
  upstreamPages: boolean;
  /** "Site layout" select in the Theme panel. */
  siteLayout: boolean;
}

/**
 * Every property optional, recursively. Used for the "overrides" shape of config namespaces.
 * Arrays and functions are left whole — a partial list entry is not a meaningful override.
 */
export type ChaiConfigDeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends object
      ? { [P in keyof T]?: ChaiConfigDeepPartial<T[P]> }
      : T;

/**
 * Partial server feature overrides; omitted keys are derived at resolve time.
 * Core flags only — plugin-owned keys ({@link ChaiPluginFeatures}) are set by
 * registering the plugin, not via app config.
 */
export type ChaiServerFeaturesInput = ChaiConfigDeepPartial<Omit<ChaiServerFeatures, keyof ChaiPluginFeatures>>;

/**
 * Partial media manager overrides. Plugin-owned tabs
 * ({@link ChaiPluginMediaManagerConfig}) are configured via plugin options, not
 * via app config.
 */
export type ChaiMediaManagerConfigInput = ChaiConfigDeepPartial<
  Omit<ChaiMediaManagerConfig, keyof ChaiPluginMediaManagerConfig>
>;

/**
 * Last say over the site-settings row before it is cached and handed to renderers.
 *
 * Receives the raw row read from `apps` (draft) or `apps_online` (published) and returns the
 * object every `getSiteSettings()` consumer sees. This is where an app derives or overrides
 * fields from its own columns — the core selects the whole row and knows nothing about them.
 *
 * Runs inside the site-settings cache entry, so it must be a pure function of the row: no
 * per-request state, no reads that can change between two requests for the same site.
 */
export type ChaiSiteSettingsTransform = (
  settings: Record<string, any>,
  ctx: { appId: string; draftMode: boolean },
) => Record<string, any> | Promise<Record<string, any>>;

export type ResolvedChaiBuilderServerConfig = {
  debugLevel: ChaiDebugLevel;
  globalDataProvider: ChaiGlobalDataProvider;
  /** Null = unresolved paths simply 404. */
  onPageNotFound: ChaiPageNotFoundHandler | null;
  pageTypes: ChaiPageTypeEntry[];
  /** @deprecated Use `chaiCollections` instead. */
  collections: ChaiCollectionEntry[];
  /**
   * @deprecated Use `chaiCollections` instead. Kept as a read-only mirror of
   * `chaiCollections` so hosts reading the resolved config keep working.
   */
  repeaterData?: ChaiRepeaterDataEntry[];
  /**
   * Optional on purpose: hosts that build a resolved config literal (tests,
   * plugins) predate this key and must keep type-checking. Always read it
   * through `getConfigChaiCollections()`, never as a bare array.
   */
  chaiCollections?: ChaiRepeaterDataEntry[];
  blockDataProviders: Record<string, ChaiBlockDataProvider>;
  trash: ChaiTrashEntry[];
  features: ChaiServerFeatures;
  actions: Record<string, ChaiAction<any, any>>;
  /** @deprecated Use `actions` instead */
  builderActions: Record<string, ChaiAction<any, any>>;
  /**
   * Additional default-role grants (role -> permission keys, wildcards allowed).
   * Contributed by plugins for their own keys. Applied only when roles resolve
   * to the built-in DEFAULT_ROLE_MAPS fallback — never overlaid on an explicit
   * role map or DB-managed roles.
   */
  defaultRoleGrants: ChaiDefaultRoleGrants;
  /** Role configuration. Undefined = use DEFAULT_ROLE_MAPS. */
  roles: ChaiRolesConfig | undefined;
  ai: ResolvedChaiAiGlobalConfig;
  mediaManager: ChaiMediaManagerConfig;
  db: ResolvedChaiDbConfig;
  /** Drizzle fragments contributed by plugins; merged into `db.schema` per dialect. */
  schemaFragments: ChaiSchemaFragment[];
  /** Render-time request interception contributed by plugins, keyed by subscriber name. */
  requestMiddlewares: ChaiRequestMiddlewareEntry[];
  /** Plugin setup callbacks, run once the config is resolved. */
  setupHooks: ChaiSetupHook[];
  /** Process-wide context resolver from a plugin. An explicit `createChaiBuilder` context wins over it. */
  contextResolver: ChaiContextResolver | undefined;
  /** Undefined = the stored row is used as-is. */
  transformSiteSettings: ChaiSiteSettingsTransform | undefined;
  /** Null = the SDK keeps its registration-order tie-break between dynamic templates. */
  resolveDynamicTemplateTie: ChaiDynamicTemplateTieHandler | null;
  /** Null = no upstream pages: linking, rendering and cloning refuse. */
  upstreamPageSource: ChaiUpstreamPageSource | null;
};

export type ChaiBuilderServerConfigInput = {
  db: ChaiDbConfigInput;
  /**
   * Server plugins. Each is a `(config) => config` function contributing a
   * feature's actions, permissions, feature flags, schema fragments, and
   * process-wide registrations. They run in array order, each seeing the
   * previous one's output. A registered plugin enables its feature; the
   * plugin's options carry its config. Nothing is installed by default — name
   * the plugins you want explicitly.
   */
  plugins?: ChaiServerPlugin[];
  globalDataProvider?: ChaiGlobalDataProvider;
  /**
   * Last say over a path that matched no page and no stored redirect. Return
   * `{ redirect }` to send the visitor somewhere, or nothing to keep the 404.
   */
  onPageNotFound?: ChaiPageNotFoundHandler;
  /**
   * Arbitrate when several dynamic templates match one URL (e.g. `vdp_page` vs a
   * legacy SEO listing sharing `/auto-usage`). Return one of the candidates, or
   * nothing to keep the SDK's registration-order default.
   */
  resolveDynamicTemplateTie?: ChaiDynamicTemplateTieHandler;
  /** Where linked pages' upstream pages come from (`features.upstreamPages`). */
  upstreamPageSource?: ChaiUpstreamPageSource;
  pageTypes?: ChaiPageTypeEntry[];
  /** @deprecated Use `chaiCollections` instead. */
  collections?: ChaiCollectionEntry[];
  /** @deprecated Use `chaiCollections` instead. Merged into `chaiCollections` at resolve time. */
  repeaterData?: ChaiRepeaterDataEntry[];
  /** Collection data sources with declarative filter/sort/limit support. */
  chaiCollections?: ChaiRepeaterDataEntry[];
  blockDataProviders?: Record<string, ChaiBlockDataProvider>;
  ai?: ChaiConfigDeepPartial<ResolvedChaiAiGlobalConfig>;
  /** Media manager tabs owned by the core. Plugin tabs are configured via plugin options. */
  mediaManager?: ChaiMediaManagerConfigInput;
  trash?: ChaiTrashEntry[];
  /**
   * Server-backed builder features (core flags only). Omitted keys are derived
   * when the config is resolved: `trash` and `ai` default from trash entities
   * and AI models. Plugin-owned flags (`redirects`, `revisions`, `aiCredits`,
   * …) are enabled by registering the plugin and configured via its options —
   * they cannot be set here.
   */
  features?: ChaiServerFeaturesInput;
  actions?: Record<string, ChaiAction<any, any>>;
  /** @deprecated Use `actions` instead */
  builderActions?: Record<string, ChaiAction<any, any>>;
  /**
   * Additional default-role grants (role -> permission keys, wildcards allowed).
   * Contributed by plugins for their own keys; applied only on the
   * DEFAULT_ROLE_MAPS fallback. Use `mergeChaiDefaultRoleGrants` to append.
   */
  defaultRoleGrants?: ChaiDefaultRoleGrants;
  /** Role configuration. Omit to use DEFAULT_ROLE_MAPS. Pass `{ source: 'custom' }` to load from DB. */
  roles?: ChaiRolesConfig;
  debugLevel?: ChaiDebugLevel;
  /** Drizzle fragments merged into the active schema for the active dialect. Usually contributed by plugins. */
  schemaFragments?: ChaiSchemaFragment[];
  /** Render-time request interception (e.g. stored redirects). Usually contributed by plugins. */
  requestMiddlewares?: ChaiRequestMiddlewareEntry[];
  /** Callbacks run at the end of `buildChaiBuilderConfig` with the resolved config. Usually contributed by plugins. */
  setupHooks?: ChaiSetupHook[];
  /** Process-wide context resolver. Last writer wins; an explicit `createChaiBuilder` context wins over all. */
  contextResolver?: ChaiContextResolver;
  /** Reshape the stored site-settings row before it is cached. Omit to use it as-is. */
  transformSiteSettings?: ChaiSiteSettingsTransform;
};
