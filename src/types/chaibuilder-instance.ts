import type { ChaiCoreSchema } from "~/db/schema-shape";
import type { ChaiDbContext, ChaiDbInstance, ChaiDbResult } from "~/server/chai-actions/db";
import type {
  ChaiCreateRoleArgs,
  ChaiDeleteRoleArgs,
  ChaiGetRoleArgs,
  ChaiRoleRecord,
  ChaiUpdateRoleArgs,
} from "~/types/roles";
import type {
  createPage,
  deleteLibraryItem,
  deletePage,
  deletePageRevision,
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
  upsertLibraryItem,
} from "~/server/chai-builder/authenticated";
import type { handleHttpAction } from "~/server/chai-builder/handle-http-action";
import type { generateMetaData } from "~/server/chai-builder/public/generate-meta-data";
import type { getBlocksStyles } from "~/server/chai-builder/public/get-blocks-styles";
import type { getClientSettings } from "~/server/chai-builder/public/get-client-settings";
import type { getBaseSlugs } from "~/server/chai-builder/public/get-base-slugs";
import type { getPage } from "~/server/chai-builder/public/get-page";
import type {
  getDataByCollections,
  getDataByPageType,
  getPageData,
  getSiteGlobalData,
} from "~/server/chai-builder/public/get-page-data";
import type { getPageMetadataPayload } from "~/server/chai-builder/public/get-page-metadata-payload";
import type { getPagePayload } from "~/server/chai-builder/public/get-page-payload";
import type { getPageStyles } from "~/server/chai-builder/public/get-page-styles";
import type { getPages } from "~/server/chai-builder/public/get-pages";
import type { getSiteDomains } from "~/server/chai-builder/public/get-site-domains";
import type { getSiteSettings } from "~/server/chai-builder/public/get-site-settings";
import type { resolveLink } from "~/server/chai-builder/public/resolve-link";
import type { resolveLinksInPageBlocks } from "~/server/chai-builder/public/resolve-links-batch";
import type { ResolvedChaiAiGlobalConfig, ResolvedChaiBuilderServerConfig } from "~/types/server-config";
import type { ChaiPageType } from "~/types/actions";
import type { ChaiRequestContext } from "~/types/chaibuilder-config";
import type { CollectionConfig } from "~/types/deprecated";
import type { ChaiRepeaterDataEntry } from "~/types/repeater-data";
import type { ChaiTrashableEntity } from "~/types/trash";

type ChaiPageTypeEntry = ChaiPageType & {
  partial?: boolean;
};

type ChaiCollectionEntry = CollectionConfig<any>;

type ChaiTrashEntry = ChaiTrashableEntity;

type ChaiGlobalDataProvider = (ctx: { lang: string; draft: boolean; inBuilder: boolean }) => Promise<unknown>;

/**
 * Plugin-contributed instance namespaces (`cb.<namespace>.<fn>`), merged into
 * the instance by `getChaiBuilder` from the instance-api registry
 * (`registerChaiInstanceApi`). Each plugin augments this interface next to its
 * registration call, so the namespace's type travels with the plugin:
 *
 * ```ts
 * // redirects/server/instance-api.ts
 * declare module "~/types/chaibuilder-instance" {
 *   interface ChaiPluginInstanceApis {
 *     redirects: typeof redirectsInstanceApi;
 *   }
 * }
 * ```
 *
 * Like `roles`, a namespace exists at runtime only when its plugin is
 * registered — an install without the plugin has no `cb.<namespace>` object.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChaiPluginInstanceApis {}

/**
 * ChaiBuilder instance returned by getChaiBuilder.
 * Method signatures are derived from the underlying API implementations.
 */
export interface ChaiBuilderInstance<
  TExtra extends Record<string, unknown> = Record<never, never>,
> extends ChaiPluginInstanceApis {
  config: Readonly<ResolvedChaiBuilderServerConfig & TExtra>;
  getConfig<K extends string & keyof TExtra>(key: K): TExtra[K];
  context: Readonly<ChaiRequestContext>;

  readonly db: ChaiDbInstance;
  readonly schema: ChaiCoreSchema;
  safeQuery: <T>(queryFn: (ctx: ChaiDbContext) => Promise<T>) => Promise<ChaiDbResult<T>>;

  // Registry reads
  getPageType: (key: string) => ChaiPageTypeEntry | undefined;
  getPageTypes: () => ChaiPageTypeEntry[];
  /** @deprecated Use `getChaiCollection` instead. */
  getCollection: (id: string) => ChaiCollectionEntry | undefined;
  /** @deprecated Use `getChaiCollections` instead. */
  getCollections: () => ChaiCollectionEntry[];
  /** @deprecated Use `getChaiCollection` instead. */
  getRepeaterDataSource: (id: string) => ChaiRepeaterDataEntry | undefined;
  /** @deprecated Use `getChaiCollections` instead. */
  getRepeaterData: () => ChaiRepeaterDataEntry[];
  getChaiCollection: (id: string) => ChaiRepeaterDataEntry | undefined;
  getChaiCollections: () => ChaiRepeaterDataEntry[];
  getTrashEntity: (key: string) => ChaiTrashEntry | undefined;
  getAIConfig: () => ResolvedChaiAiGlobalConfig;

  // Request / render scoping
  runPageRequest: <T>(fn: () => T | Promise<T>) => Promise<T>;
  withRenderPhase: <T>(label: string, fn: () => T | Promise<T>, detail?: string) => Promise<T>;
  runPageRender: <T>(slug: string, fn: () => T | Promise<T>) => Promise<T>;

  // Public page APIs
  getPage: typeof getPage;
  getPagePayload: typeof getPagePayload;
  getPageData: typeof getPageData;
  generateMetaData: typeof generateMetaData;
  getPageMetadataPayload: typeof getPageMetadataPayload;
  getPages: typeof getPages;
  getBaseSlugs: typeof getBaseSlugs;

  getSiteGlobalData: typeof getSiteGlobalData;
  getDataByPageType: typeof getDataByPageType;
  getDataByCollections: typeof getDataByCollections;
  getGlobalData: ChaiGlobalDataProvider;

  getPageStyles: typeof getPageStyles;
  getBlocksStyles: typeof getBlocksStyles;

  resolveLink: typeof resolveLink;
  resolveLinksInBlocks: typeof resolveLinksInPageBlocks;

  getSiteSettings: typeof getSiteSettings;
  getSiteDomains: typeof getSiteDomains;
  getClientSettings: typeof getClientSettings;

  // Chai Actions
  runAction: <I = unknown, O = unknown>(name: string, input: I) => Promise<O>;
  tryAction: <I = unknown, O = unknown>(
    name: string,
    input: I,
  ) => Promise<
    | { ok: true; data: O }
    | { ok: false; error: { code: string; message: string; status: number; metadata?: Record<string, unknown> } }
  >;
  handleHttpAction: typeof handleHttpAction;

  // Authenticated APIs
  getAssets: typeof getAssets;
  getAsset: typeof getAsset;
  updateAsset: typeof updateAsset;
  searchImages: typeof searchImages;
  createPage: typeof createPage;
  deletePage: typeof deletePage;
  duplicatePage: typeof duplicatePage;
  getWebsitePages: typeof getWebsitePages;
  updatePage: typeof updatePage;
  updatePageMetadata: typeof updatePageMetadata;
  takeOffline: typeof takeOffline;
  getLibraries: typeof getLibraries;
  getLibraryGroups: typeof getLibraryGroups;
  getLibraryItem: typeof getLibraryItem;
  getLibraryItems: typeof getLibraryItems;
  upsertLibraryItem: typeof upsertLibraryItem;
  deleteLibraryItem: typeof deleteLibraryItem;
  getTemplatesByType: typeof getTemplatesByType;
  markAsTemplate: typeof markAsTemplate;
  unmarkAsTemplate: typeof unmarkAsTemplate;
  getTrashedItems: typeof getTrashedItems;
  restoreTrashedItem: typeof restoreTrashedItem;
  deleteTrashedItemPermanently: typeof deleteTrashedItemPermanently;
  permanentlyDeleteByDays: typeof permanentlyDeleteByDays;
  trashEntity: typeof trashEntity;
  getPageRevisions: typeof getPageRevisions;
  getRevisionPage: typeof getRevisionPage;
  deletePageRevision: typeof deletePageRevision;
  restorePage: typeof restorePage;

  /**
   * Role CRUD over the `roles` table. Available at runtime only when the roles
   * plugin is active (`roles: { source: "custom" }`) — otherwise these dispatch
   * unknown actions and throw, same as the trash/revisions namespaces when
   * their plugin is absent.
   */
  roles: {
    getAll: () => Promise<ChaiRoleRecord[]>;
    get: (data: ChaiGetRoleArgs) => Promise<ChaiRoleRecord | null>;
    create: (data: ChaiCreateRoleArgs) => Promise<ChaiRoleRecord>;
    update: (data: ChaiUpdateRoleArgs) => Promise<ChaiRoleRecord>;
    delete: (data: ChaiDeleteRoleArgs) => Promise<{ deleted: boolean }>;
  };
}
