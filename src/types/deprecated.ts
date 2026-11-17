/**
 * Deprecated names of `<pkg>/types`, re-exported by `./index.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import type { ChaiSavePageArgs } from "~/types/chaibuilder-editor-props";
import type { ChaiBuilderRouteProps, ChaiIncomingRequest, ChaiRequestContext } from "~/types/chaibuilder-config";
import type { ChaiBlock } from "~/types/common";

// ---------------------------------------------------------------------------------------------
// Collections, superseded by repeater data (`~/types/repeater-data`).
// ---------------------------------------------------------------------------------------------

type FilterOptions = {
  id: string;
  name: string;
  description?: string;
};

type SortOptions = {
  id: string;
  name: string;
  description?: string;
};

/**
 * @deprecated Use `ChaiRepeaterDataDefinition` from `<pkg>/types`. Kept for compatibility.
 * Note: the `sorts` key here never matched the server-side `CollectionConfig.sort`
 * key, so the legacy Sort dropdown never populated.
 */
export type ChaiCollectoin = {
  id: string;
  name: string;
  description?: string;
  filters?: FilterOptions[];
  sorts?: SortOptions[];
};

/**
 * Correctly spelled alias of {@link ChaiCollectoin}.
 * @deprecated Use `ChaiRepeaterDataDefinition` from `<pkg>/types`. Kept for compatibility.
 */
export type ChaiCollection = ChaiCollectoin;

/** @deprecated Use `ChaiRepeaterDataFetchArgs` from `<pkg>/types`. Kept for compatibility. */
export type CollectionFetchParams = {
  block: ChaiBlock;
  inBuilder: boolean;
  draft: boolean;
  lang: string;
  pageProps: {
    slug: string;
    params?: Record<string, string>;
    [key: string]: any;
  };
};

/**
 * @deprecated Use `ChaiRepeaterDataConfig` from `<pkg>/types` — declarative fields with typed
 * filters, sorting and limit. Kept for compatibility.
 */
export interface CollectionConfig<T> {
  id: string;
  name: string;
  icon?: string;
  filters?: { id: string; name: string }[];
  sort?: { id: string; name: string }[];
  fetch: (params: CollectionFetchParams) => Promise<{ items: T[]; totalItems?: number }>;
}

/**
 * Collection entry
 * @deprecated Use `ChaiRepeaterDataEntry` from `<pkg>/types`. Kept for compatibility.
 */
export type ChaiCollectionEntry = CollectionConfig<any>;

// ---------------------------------------------------------------------------------------------
// Request context, superseded by the context resolver.
// ---------------------------------------------------------------------------------------------

/**
 * @deprecated Context passed to the removed `resolveSiteUrl` config option.
 * Resolve `siteUrl` inside your `ChaiContextResolver` instead. Kept for compatibility.
 */
export type ChaiResolveSiteUrlContext = {
  appId: string;
};

/** @deprecated Use `ChaiContextResolverArgs` from `<pkg>/types`. Kept for compatibility. */
export type ChaiRequestContextArgs<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = {
  routeProps: ChaiBuilderRouteProps;
  request?: Req;
};

/** @deprecated Use `ChaiContextResolver` from `<pkg>/types`. Kept for compatibility. */
export type ChaiRequestContextResolver<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = (
  args: ChaiRequestContextArgs<Req>,
) => Partial<ChaiRequestContext> | Promise<Partial<ChaiRequestContext>>;

// ---------------------------------------------------------------------------------------------
// Renamed types.
// ---------------------------------------------------------------------------------------------

/** @deprecated Use `ChaiTheme` from `<pkg>/types`. Kept for compatibility. */
export type ChaiBuilderThemeValues = ChaiTheme;

/** @deprecated Use `ChaiSavePageArgs` from `<pkg>/types`. Kept for compatibility. */
export type SavePageData = ChaiSavePageArgs;

export {
  /** @deprecated Use `ChaiAiChatOptions` from `<pkg>/types`. Kept for compatibility. */
  type ChaiAiChatOptions as AIChatOptions,
  /** @deprecated Use `ChaiAiContext` from `<pkg>/types`. Kept for compatibility. */
  type ChaiAiContext as AIContext,
  /** @deprecated Use `ChaiListAssetsArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiListAssetsArgs as AssetsParams,
  /** @deprecated Use `ChaiPagesAiHandler` from `<pkg>/types`. Kept for compatibility. */
  type ChaiPagesAiHandler as ChaiBuilderPagesAIInterface,
  /** @deprecated Use `ChaiSiteSettings` from `<pkg>/types`. Kept for compatibility. */
  type ChaiSiteSettings as ChaiWebsiteSetting,
  /** @deprecated Use `ChaiImageConfig` from `<pkg>/types`. Kept for compatibility. */
  type ChaiImageConfig as ImageConfig,
} from "~/types/actions";

export {
  /** @deprecated Use `ChaiAiGlobalConfig` from `<pkg>/types`. Kept for compatibility. */
  type ChaiAiGlobalConfig as ChaiAIGlobalConfig,
  /** @deprecated Use `ChaiLogAiRequestArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiLogAiRequestArgs as LogAiRequestParams,
  /** @deprecated Use `ResolvedChaiAiGlobalConfig` from `<pkg>/types`. Kept for compatibility. */
  type ResolvedChaiAiGlobalConfig as ResolvedChaiAIGlobalConfig,
} from "~/types/ai-config";

export {
  /** @deprecated Use `ChaiAskAiResult` from `<pkg>/types`. Kept for compatibility. */
  type ChaiAskAiResult as ChaiAskAiResponse,
  /** @deprecated Use `ChaiSavePageArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiSavePageArgs as ChaiSavePageData,
  /** @deprecated Use `ChaiSaveSiteArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiSaveSiteArgs as ChaiSaveWebsiteData,
} from "~/types/chaibuilder-editor-props";

export {
  /** @deprecated Use `ChaiDbInstance` from `<pkg>/types`. Kept for compatibility. */
  type ChaiDbInstance as DbInstance,
} from "~/types/db";

export {
  /** @deprecated Use `ChaiGetAssetArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiGetAssetArgs as GetAssetInput,
  /** @deprecated Use `ChaiSearchImagesArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiSearchImagesArgs as SearchImagesInput,
  /** @deprecated Use `ChaiUpdateAssetArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiUpdateAssetArgs as UpdateAssetInput,
} from "~/types/media";

export {
  /** @deprecated Use `ChaiRoleGrant` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRoleGrant as ChaiRoleEntry,
} from "~/types/rbac";

export {
  /** @deprecated Use `ChaiRedirectEntry` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRedirectEntry as RedirectEntry,
} from "~/types/redirects";

export {
  /** @deprecated Use `ChaiRepeaterDataFetchArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRepeaterDataFetchArgs as ChaiRepeaterDataFetchParams,
} from "~/types/repeater-data";

export {
  /** @deprecated Use `ChaiDeletePageRevisionArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiDeletePageRevisionArgs as DeletePageRevisionActionData,
  /** @deprecated Use `ChaiGetPageRevisionsArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiGetPageRevisionsArgs as GetPageRevisionsActionData,
  /** @deprecated Use `ChaiGetRevisionPageArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiGetRevisionPageArgs as GetRevisionPageActionData,
  /** @deprecated Use `ChaiRestorePageArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRestorePageArgs as RestorePageActionData,
  /** @deprecated Use `ChaiRestorePagePart` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRestorePagePart as RestorePagePart,
} from "~/types/revisions";

export {
  /** @deprecated Use `ChaiCreateRoleArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiCreateRoleArgs as CreateRoleActionData,
  /** @deprecated Use `ChaiDeleteRoleArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiDeleteRoleArgs as DeleteRoleActionData,
  /** @deprecated Use `ChaiGetRoleArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiGetRoleArgs as GetRoleActionData,
  /** @deprecated Use `ChaiRoleRecord` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRoleRecord as RoleEntry,
  /** @deprecated Use `ChaiUpdateRoleArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiUpdateRoleArgs as UpdateRoleActionData,
} from "~/types/roles";

export {
  /** @deprecated Use `ChaiDeleteTrashPermanentlyArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiDeleteTrashPermanentlyArgs as DeletePermanentlyData,
  /** @deprecated Use `ChaiGetTrashedItemsArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiGetTrashedItemsArgs as GetTrashedItemsData,
  /** @deprecated Use `ChaiDeleteTrashByDaysArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiDeleteTrashByDaysArgs as PermanentlyDeleteByDaysData,
  /** @deprecated Use `ChaiRestoreConflictResolution` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRestoreConflictResolution as RestoreConflictResolution,
  /** @deprecated Use `ChaiRestoreTrashedItemArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiRestoreTrashedItemArgs as RestoreTrashedItemData,
  /** @deprecated Use `ChaiTrashableRecordArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiTrashableRecordArgs as TrashableRecordData,
  /** @deprecated Use `ChaiTrashContext` from `<pkg>/types`. Kept for compatibility. */
  type ChaiTrashContext as TrashContext,
  /** @deprecated Use `ChaiTrashEntityArgs` from `<pkg>/types`. Kept for compatibility. */
  type ChaiTrashEntityArgs as TrashEntityData,
  /** @deprecated Use `ChaiTrashRecord` from `<pkg>/types`. Kept for compatibility. */
  type ChaiTrashRecord as TrashRecord,
} from "~/types/trash";
