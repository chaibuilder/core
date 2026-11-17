import "~/server/only-server";
import { getChaiBuilderConfigOnInit } from "~/server/build-config";
import {
  ensureChaiDbReady,
  getChaiDb,
  registerChaiDb,
  safeQuery,
  schema,
  type ChaiDbContext,
} from "~/server/chai-actions/db";
import { getOptionalRequestState, runInContext } from "~/server/chai-builder/state";
import { getDebugLevel, setGlobalDebugLevel } from "~/server/debug/debug-level";
import { logApiComplete, logInitPhase, logPhaseStart, logTraceStart } from "~/server/debug/debug-log";
import { withDebugTiming, withRenderPhase } from "~/server/debug/debug-timing";
import { ensureTrace, getTraceDetail } from "~/server/debug/debug-trace";
import {
  getActiveChaiBuilderConfig,
  getConfigAI,
  getConfigChaiCollection,
  getConfigChaiCollections,
  getConfigCollection,
  getConfigCollections,
  getConfigPageType,
  getConfigPageTypes,
  getConfigTrashEntity,
  setActiveChaiBuilderConfig,
} from "~/server/defaults/config-registry";
import type { ResolvedChaiBuilderServerConfig } from "~/types";
import type {
  ChaiBuilderInstance,
  ChaiBuilderRouteProps,
  ChaiIncomingRequest,
  ChaiRequestContext,
} from "~/types/chaibuilder-config";
import type { ChaiPluginInstanceApis } from "~/types/chaibuilder-instance";
import { getContributedChaiInstanceApis } from "~/server/plugin-api/instance-api-registry";
import { beginChaiRequestContextGeneration, resolveSharedChaiContext } from "./resolve-chai-context";

// Import existing APIs to bind to instance
import { handleHttpAction } from "~/server/chai-builder/handle-http-action";
import { generateMetaData } from "~/server/chai-builder/public/generate-meta-data";
import type { getBlocksStyles } from "~/server/chai-builder/public/get-blocks-styles";
import { getBaseSlugs } from "~/server/chai-builder/public/get-base-slugs";
import { getClientSettings } from "~/server/chai-builder/public/get-client-settings";
import { getPage } from "~/server/chai-builder/public/get-page";
import {
  getDataByCollections,
  getDataByPageType,
  getPageData,
  getSiteGlobalData,
} from "~/server/chai-builder/public/get-page-data";
import { getPageMetadataPayload } from "~/server/chai-builder/public/get-page-metadata-payload";
import { getPagePayload } from "~/server/chai-builder/public/get-page-payload";
import type { getPageStyles } from "~/server/chai-builder/public/get-page-styles";
import { getPages } from "~/server/chai-builder/public/get-pages";
import { getSiteDomains } from "~/server/chai-builder/public/get-site-domains";
import { getSiteSettings } from "~/server/chai-builder/public/get-site-settings";
import { resolveLink } from "~/server/chai-builder/public/resolve-link";
import { resolveLinksInPageBlocks } from "~/server/chai-builder/public/resolve-links-batch";

// Authenticated APIs
import {
  createPage,
  createRole,
  deleteLibraryItem,
  deletePage,
  deletePageRevision,
  deleteRole,
  deleteTrashedItemPermanently,
  duplicatePage,
  getAsset,
  getAssets,
  getLibraries,
  getLibraryGroups,
  getLibraryItem,
  getLibraryItems,
  getPageRevisions,
  getRevisionPage,
  getRole,
  getRoles,
  getTemplatesByType,
  getTrashedItems,
  getWebsitePages,
  markAsTemplate,
  permanentlyDeleteByDays,
  restorePage,
  restoreTrashedItem,
  searchImages,
  takeOffline,
  trashEntity,
  unmarkAsTemplate,
  updateAsset,
  updatePage,
  updatePageMetadata,
  updateRole,
  upsertLibraryItem,
} from "~/server/chai-builder/authenticated";

type ChaiBuilderCore = {
  config: Readonly<ResolvedChaiBuilderServerConfig>;
  ensureSynced: () => Promise<void>;
};

let _core: ChaiBuilderCore | null = null;

/** @internal Reset core singleton between unit tests. */
export function resetChaiBuilderCoreForTests(): void {
  _core = null;
}

type GetChaiBuilderOptions = {
  config: ResolvedChaiBuilderServerConfig;
  routeProps?: ChaiBuilderRouteProps;
  request?: ChaiIncomingRequest;
};

function formatTraceDetail(label: string, args: unknown[]): string | undefined {
  if (label === "getPagePayload" || label === "getPage" || label === "getPageMetadataPayload") {
    return typeof args[0] === "string" ? `slug=${args[0]}` : undefined;
  }
  if (label === "runAction" || label.startsWith("runAction:") || label.startsWith("tryAction:")) {
    return typeof args[0] === "string" ? args[0] : undefined;
  }
  if (label === "handleHttpAction" && args[0] && typeof args[0] === "object" && "action" in args[0]) {
    return String((args[0] as { action?: string }).action ?? "");
  }
  return undefined;
}

function bindWithDebug<Args extends unknown[], R>(
  context: ChaiRequestContext,
  fn: (...args: Args) => R,
  label: string,
  kind: "api" | "action" = "api",
): (...args: Args) => R {
  return (...args: Args) =>
    runInContext(context, () => {
      const detail = formatTraceDetail(label, args);
      if (ensureTrace(label, detail) && getDebugLevel() >= 1) {
        logTraceStart(label, detail ?? getTraceDetail() ?? undefined);
      } else if (getOptionalRequestState()?.traceId && getDebugLevel() >= 1) {
        logPhaseStart(label, detail ?? getTraceDetail() ?? undefined);
      }

      if (getDebugLevel() >= 2) {
        return withDebugTiming(label, () => fn(...args), kind) as R;
      }

      if (getDebugLevel() >= 1) {
        const start = performance.now();
        const result = fn(...args);
        const logComplete = () => logApiComplete(label, Math.round(performance.now() - start));

        if (result instanceof Promise) {
          return result.finally(logComplete) as R;
        }

        logComplete();
        return result;
      }

      return fn(...args);
    });
}

function bindActionWithDebug<Args extends unknown[], R>(
  context: ChaiRequestContext,
  fn: (...args: Args) => R,
  getLabel: (...args: Args) => string,
): (...args: Args) => R {
  return (...args: Args) => {
    const label = getLabel(...args);
    return bindWithDebug(context, fn, label, "action")(...args);
  };
}

/**
 * Returns a request-scoped ChaiBuilder.
 *
 * - `getChaiBuilder(config)` — uses shared per-request context when already resolved (e.g. by an
 *   earlier `getChaiBuilder(config, routeProps)` in the same render); otherwise invokes the registered
 *   context resolver (see `registerChaiContextResolver`), falling back to a static default when none is set.
 * - `getChaiBuilder(config, { params, searchParams }, request?)` — same props shape as `page` / `layout` /
 *   `generateMetadata`. Resolves context via the registered resolver and stores it for the rest of the request.
 *
 * Process-level core (db, onInit) runs once; request context is shared across all `getChaiBuilder` calls.
 */
export async function getChaiBuilder<TExtra extends Record<string, unknown> = Record<never, never>>(
  config: ResolvedChaiBuilderServerConfig & TExtra,
): Promise<ChaiBuilderInstance<TExtra>>;
export async function getChaiBuilder<TExtra extends Record<string, unknown> = Record<never, never>>(
  config: ResolvedChaiBuilderServerConfig & TExtra,
  routeProps: ChaiBuilderRouteProps,
  request?: ChaiIncomingRequest,
): Promise<ChaiBuilderInstance<TExtra>>;
export async function getChaiBuilder<TExtra extends Record<string, unknown> = Record<never, never>>(
  options: GetChaiBuilderOptions & { config: ResolvedChaiBuilderServerConfig & TExtra },
): Promise<ChaiBuilderInstance<TExtra>>;
export async function getChaiBuilder(
  configOrOptions: ResolvedChaiBuilderServerConfig | GetChaiBuilderOptions,
  routePropsArg?: ChaiBuilderRouteProps,
  requestArg?: ChaiIncomingRequest,
): Promise<ChaiBuilderInstance<any>> {
  const { config, routeProps, request } =
    "config" in configOrOptions
      ? configOrOptions
      : { config: configOrOptions, routeProps: routePropsArg, request: requestArg };

  if (!_core) {
    _core = createCore(config);
  }

  if (request !== undefined && routeProps === undefined) {
    throw new Error(
      "ChaiBuilder: when passing a request, supply route props as the second argument ({ params, searchParams }).",
    );
  }

  beginChaiRequestContextGeneration();
  const builderStart = performance.now();
  const ctx = await resolveSharedChaiContext(routeProps, request);

  await ensureChaiDbReady();
  await _core.ensureSynced();
  if (getDebugLevel() >= 1) {
    logInitPhase("getChaiBuilder", Math.round(performance.now() - builderStart));
  }
  return createContextualInstance(_core, ctx);
}

function createContextualInstance(core: ChaiBuilderCore, context: ChaiRequestContext): ChaiBuilderInstance<any> {
  const { config } = core;
  const bind = <Args extends unknown[], R>(fn: (...args: Args) => R, label: string) =>
    bindWithDebug(context, fn, label);

  const getGlobalData = bindWithDebug(
    context,
    async (ctx: { lang: string; draft: boolean; inBuilder: boolean }): Promise<any> => {
      return await config.globalDataProvider(ctx);
    },
    "getGlobalData",
  );

  const runActionFn = async <I, O>(name: string, input: I): Promise<O> => {
    const { runChaiAction } = await import("~/server/chai-actions/dispatch-action");
    return runChaiAction(name, input) as Promise<O>;
  };

  const tryActionFn = async <I, O>(name: string, input: I) => {
    const { tryChaiAction } = await import("~/server/chai-actions/dispatch-action");
    return tryChaiAction<O>(name, input);
  };

  const runAction = bindActionWithDebug(
    context,
    runActionFn,
    (name: string, _input: unknown) => `runAction:${name}`,
  ) as ChaiBuilderInstance["runAction"];

  const tryAction = bindActionWithDebug(
    context,
    tryActionFn,
    (name: string, _input: unknown) => `tryAction:${name}`,
  ) as ChaiBuilderInstance["tryAction"];

  const db = getChaiDb();
  const dbCtx: ChaiDbContext = { db, schema };

  // Plugin-contributed namespaces (registerChaiInstanceApi), each function
  // context-bound under "<namespace>.<fn>". Spread first so core keys always
  // win over a colliding namespace. The cast is the runtime/type seam: a
  // namespace is typed whenever its plugin is in the program, but exists at
  // runtime only when the plugin is registered (same contract as `roles`).
  // Null-prototype: namespaces/keys are validated at registration, but keep
  // the merge itself immune to prototype-key surprises.
  const pluginApis: Record<string, Record<string, unknown>> = Object.create(null);
  for (const [ns, api] of Object.entries(getContributedChaiInstanceApis())) {
    const bound: Record<string, unknown> = Object.create(null);
    for (const [fnName, fn] of Object.entries(api)) {
      bound[fnName] = bind(fn, `${ns}.${fnName}`);
    }
    pluginApis[ns] = bound;
  }

  return {
    ...(pluginApis as unknown as ChaiPluginInstanceApis),
    config,
    getConfig: (key: string) => (config as any)[key],
    context: Object.freeze({ ...context }),

    db,
    schema,
    safeQuery: <T>(queryFn: (ctx: ChaiDbContext) => Promise<T>) => safeQuery(() => queryFn(dbCtx)),

    runPageRequest: <T>(fn: () => T | Promise<T>) => Promise.resolve(runInContext(context, fn)),
    withRenderPhase: <T>(label: string, fn: () => T | Promise<T>, detail?: string) =>
      Promise.resolve(runInContext(context, () => withRenderPhase(label, fn, detail))),
    runPageRender: <T>(slug: string, fn: () => T | Promise<T>) =>
      Promise.resolve(
        runInContext(context, async () => {
          const renderStart = performance.now();
          if (ensureTrace("renderPage", `slug=${slug}`)) {
            logTraceStart("renderPage", `slug=${slug}`);
          }
          try {
            return await fn();
          } finally {
            if (getDebugLevel() >= 1) {
              logApiComplete("renderPage", Math.round(performance.now() - renderStart));
            }
          }
        }),
      ),

    getPage: bind(getPage, "getPage"),
    getPagePayload: bind(getPagePayload, "getPagePayload"),
    getPageData: bind(getPageData, "getPageData"),
    generateMetaData: bind(generateMetaData, "generateMetaData"),
    getPageMetadataPayload: bind(getPageMetadataPayload, "getPageMetadataPayload"),
    getPages: bind(getPages, "getPages"),
    getBaseSlugs: bind(getBaseSlugs, "getBaseSlugs"),

    getSiteGlobalData: bind(getSiteGlobalData, "getSiteGlobalData"),
    getDataByPageType: bind(getDataByPageType, "getDataByPageType"),
    getDataByCollections: bind(getDataByCollections, "getDataByCollections"),
    getGlobalData,

    getPageStyles: bind(async (...args: Parameters<typeof getPageStyles>) => {
      const { getPageStyles: getPageStylesFn } = await import("~/server/chai-builder/public/get-page-styles");
      return getPageStylesFn(...args);
    }, "getPageStyles"),
    getBlocksStyles: bind(async (...args: Parameters<typeof getBlocksStyles>) => {
      const { getBlocksStyles: getBlocksStylesFn } = await import("~/server/chai-builder/public/get-blocks-styles");
      return getBlocksStylesFn(...args);
    }, "getBlocksStyles"),

    resolveLink: bind(resolveLink, "resolveLink"),
    resolveLinksInBlocks: bind(resolveLinksInPageBlocks, "resolveLinksInBlocks"),

    getSiteSettings: bind(getSiteSettings, "getSiteSettings"),
    getSiteDomains: bind(getSiteDomains, "getSiteDomains"),
    getClientSettings: bind(getClientSettings, "getClientSettings"),

    getPageType: getConfigPageType,
    getPageTypes: getConfigPageTypes,
    getCollection: getConfigCollection,
    getCollections: getConfigCollections,
    getRepeaterDataSource: getConfigChaiCollection,
    getRepeaterData: getConfigChaiCollections,
    getChaiCollection: getConfigChaiCollection,
    getChaiCollections: getConfigChaiCollections,
    getTrashEntity: getConfigTrashEntity,
    getAIConfig: getConfigAI,

    runAction,
    tryAction,
    handleHttpAction: bindActionWithDebug(
      context,
      handleHttpAction,
      (body: { action?: string }) => body?.action ?? "handleHttpAction",
    ),

    getAssets: bind(getAssets, "getAssets"),
    getAsset: bind(getAsset, "getAsset"),
    updateAsset: bind(updateAsset, "updateAsset"),
    searchImages: bind(searchImages, "searchImages"),
    createPage: bind(createPage, "createPage"),
    deletePage: bind(deletePage, "deletePage"),
    duplicatePage: bind(duplicatePage, "duplicatePage"),
    getWebsitePages: bind(getWebsitePages, "getWebsitePages"),
    updatePage: bind(updatePage, "updatePage"),
    updatePageMetadata: bind(updatePageMetadata, "updatePageMetadata"),
    takeOffline: bind(takeOffline, "takeOffline"),
    getLibraries: bind(getLibraries, "getLibraries"),
    getLibraryGroups: bind(getLibraryGroups, "getLibraryGroups"),
    getLibraryItem: bind(getLibraryItem, "getLibraryItem"),
    getLibraryItems: bind(getLibraryItems, "getLibraryItems"),
    upsertLibraryItem: bind(upsertLibraryItem, "upsertLibraryItem"),
    deleteLibraryItem: bind(deleteLibraryItem, "deleteLibraryItem"),
    getTemplatesByType: bind(getTemplatesByType, "getTemplatesByType"),
    markAsTemplate: bind(markAsTemplate, "markAsTemplate"),
    unmarkAsTemplate: bind(unmarkAsTemplate, "unmarkAsTemplate"),
    getTrashedItems: bind(getTrashedItems, "getTrashedItems"),
    restoreTrashedItem: bind(restoreTrashedItem, "restoreTrashedItem"),
    deleteTrashedItemPermanently: bind(deleteTrashedItemPermanently, "deleteTrashedItemPermanently"),
    permanentlyDeleteByDays: bind(permanentlyDeleteByDays, "permanentlyDeleteByDays"),
    trashEntity: bind(trashEntity, "trashEntity"),
    getPageRevisions: bind(getPageRevisions, "getPageRevisions"),
    getRevisionPage: bind(getRevisionPage, "getRevisionPage"),
    deletePageRevision: bind(deletePageRevision, "deletePageRevision"),
    restorePage: bind(restorePage, "restorePage"),

    roles: {
      getAll: bind(getRoles, "roles.getAll"),
      get: bind(getRole, "roles.get"),
      create: bind(createRole, "roles.create"),
      update: bind(updateRole, "roles.update"),
      delete: bind(deleteRole, "roles.delete"),
    },
  } satisfies ChaiBuilderInstance<any>;
}

function createCore(config: ResolvedChaiBuilderServerConfig): ChaiBuilderCore {
  registerChaiDb(config.db);
  setActiveChaiBuilderConfig(config);
  setGlobalDebugLevel(config.debugLevel);

  const frozenConfig = Object.freeze(config);
  let initPromise: Promise<void> | null = null;

  return {
    config: frozenConfig,
    ensureSynced: async () => {
      if (!initPromise) {
        initPromise = (async () => {
          const onInit = getChaiBuilderConfigOnInit(frozenConfig);
          if (onInit) {
            await onInit(getActiveChaiBuilderConfig());
          }
        })();
      }
      await initPromise;
    },
  };
}
