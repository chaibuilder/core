/**
 * Deprecated names of `<pkg>`, re-exported by `./index.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `ChaiNestedPathSelector` from `<pkg>`. Kept for compatibility. */
  ChaiNestedPathSelector as NestedPathSelector,
} from "~/builder/core/components/nested-path-selector";

export {
  /** @deprecated Use `createDefaultChaiLibrary` from `<pkg>`. Kept for compatibility. */
  createDefaultChaiLibrary as defaultChaiLibrary,
} from "~/builder/core/main";

export {
  /** @deprecated Use `useChaiSavePage` from `<pkg>`. Kept for compatibility. */
  useChaiSavePage as useSavePage,
} from "~/builder/hooks/use-save-page";

export {
  /** @deprecated Use `IfChaiPermission` from `<pkg>`. Kept for compatibility. */
  IfChaiPermission as PermissionChecker,
} from "~/builder/pages/client/components/permission-checker";

export {
  /** @deprecated Use `ChaiLanguageSwitcher` from `<pkg>`. Kept for compatibility. */
  ChaiLanguageSwitcher as LanguageSwitcher,
} from "~/builder/pages/client/components/topbar-left";

export {
  /** @deprecated Use `useChaiPageLockOwner` from `<pkg>`. Kept for compatibility. */
  useChaiPageLockOwner as useCurrentPageOwner,
  /** @deprecated Use `useChaiPageLockStatus` from `<pkg>`. Kept for compatibility. */
  useChaiPageLockStatus as usePageLockStatus,
  /** @deprecated Use `useChaiPageLocks` from `<pkg>`. Kept for compatibility. */
  useChaiPageLocks as usePageToUser,
} from "~/builder/pages/client/realtime";

export {
  /** @deprecated Use `ChaiImagePicker` from `<pkg>`. Kept for compatibility. */
  ChaiImagePicker as ImagePicker,
} from "~/builder/pages/digital-asset-manager/image-picker";

export {
  /** @deprecated Use `useChaiActivePage` from `<pkg>`. Kept for compatibility. */
  useChaiActivePage as useActivePage,
} from "~/builder/pages/hooks/pages/use-current-page";

export {
  /** @deprecated Use `useChaiLanguagePages` from `<pkg>`. Kept for compatibility. */
  useChaiLanguagePages as useLanguagePages,
} from "~/builder/pages/hooks/pages/use-language-pages";

export {
  /** @deprecated Use `useChaiPageData` from `<pkg>`. Kept for compatibility. */
  useChaiPageData as usePageAllData,
} from "~/builder/pages/hooks/pages/use-page-all-data";

export {
  /** @deprecated Use `useChaiPageBindingData` from `<pkg>`. Kept for compatibility. */
  useChaiPageBindingData as useBuilderPageData,
} from "~/builder/pages/hooks/pages/use-page-draft-blocks";

export {
  /** @deprecated Use `useChaiPrimaryPages` from `<pkg>`. Kept for compatibility. */
  useChaiPrimaryPages as useWebsitePages,
} from "~/builder/pages/hooks/pages/use-project-pages";

export {
  /** @deprecated Use `useChaiSiteGlobalData` from `<pkg>`. Kept for compatibility. */
  useChaiSiteGlobalData as useSiteGlobalData,
} from "~/builder/pages/hooks/pages/use-site-global-data";

export {
  /** @deprecated Use `useChaiApiUrl` from `<pkg>`. Kept for compatibility. */
  useChaiApiUrl as useApiUrl,
} from "~/builder/pages/hooks/project/use-builder-prop";

export {
  /** @deprecated Use `useChaiPageTypes` from `<pkg>`. Kept for compatibility. */
  useChaiPageTypes as usePageTypes,
} from "~/builder/pages/hooks/project/use-page-types";

export {
  /** @deprecated Use `useChaiSiteSettings` from `<pkg>`. Kept for compatibility. */
  useChaiSiteSettings as useWebsiteSetting,
} from "~/builder/pages/hooks/project/use-website-settings";

export {
  /** @deprecated Use `useChaiFallbackLang` from `<pkg>`. Kept for compatibility. */
  useChaiFallbackLang as useFallbackLang,
} from "~/builder/pages/hooks/use-fallback-lang";

export {
  /** @deprecated Use `useChaiGotoPage` from `<pkg>`. Kept for compatibility. */
  useChaiGotoPage as useGotoPage,
} from "~/builder/pages/hooks/use-goto-page";

export {
  /** @deprecated Use `useChaiClearQueryCache` from `<pkg>`. Kept for compatibility. */
  useChaiClearQueryCache as useClearAll,
  /** @deprecated Use `useChaiReloadPage` from `<pkg>`. Kept for compatibility. */
  useChaiReloadPage as useReloadPage,
} from "~/builder/pages/hooks/use-reload-page";

export {
  /** @deprecated Use `useChaiUpdateActivePageMetadata` from `<pkg>`. Kept for compatibility. */
  useChaiUpdateActivePageMetadata as useUpdateActivePageMetadata,
} from "~/builder/pages/hooks/use-update-metadata";

export {
  /** @deprecated Use `useChaiUserPermissions` from `<pkg>`. Kept for compatibility. */
  useChaiUserPermissions as useUserPermissions,
} from "~/builder/pages/hooks/user/use-check-access";

export {
  /** @deprecated Use `useChaiActionFetch` from `<pkg>`. Kept for compatibility. */
  useChaiActionFetch as useBuilderFetch,
  /** @deprecated Use `useChaiActionFetch` from `<pkg>`. Kept for compatibility. */
  useFetch,
} from "~/builder/pages/hooks/utils/use-fetch";

export {
  /** @deprecated Use `CHAI_RJSF_EXTENSIONS` from `<pkg>`. Kept for compatibility. */
  CHAI_RJSF_EXTENSIONS as RJSF_EXTENSIONS,
} from "~/builder/register-apis/register-block-settings";

export {
  /** @deprecated Use `CHAI_ADD_BLOCK_TABS` from `<pkg>`. Kept for compatibility. */
  CHAI_ADD_BLOCK_TABS as ADD_BLOCK_TABS,
  /** @deprecated Use `ChaiAddBlockTab` from `<pkg>`. Kept for compatibility. */
  type ChaiAddBlockTab as AddBlockTab,
} from "~/builder/register-apis/register-chai-add-block-tab";

export {
  /** @deprecated Use `getRegisteredChaiFetchInterceptors` from `<pkg>`. Kept for compatibility. */
  getRegisteredChaiFetchInterceptors as getChaiFetchInterceptors,
  /** @deprecated Use `runChaiFetchInterceptors` from `<pkg>`. Kept for compatibility. */
  runChaiFetchInterceptors as notifyChaiFetchInterceptors,
} from "~/builder/register-apis/register-chai-fetch-interceptor";

export {
  /** @deprecated Use `useChaiFeatureFlagToggle` from `<pkg>`. Kept for compatibility. */
  useChaiFeatureFlagToggle as useToggleChaiFeatureFlag,
} from "~/builder/register-apis/register-chai-flag";

export {
  /** @deprecated Use `unregisterChaiHooks` from `<pkg>`. Kept for compatibility. */
  unregisterChaiHooks as clearHooks,
  /** @deprecated Use `runChaiHooks` from `<pkg>`. Kept for compatibility. */
  runChaiHooks as executeChaiHooks,
  /** @deprecated Use `getRegisteredChaiHooks` from `<pkg>`. Kept for compatibility. */
  getRegisteredChaiHooks as getRegisteredHooks,
} from "~/builder/register-apis/register-chai-hooks";

export {
  /** @deprecated Use `ChaiLanguageFilterSelect` from `<pkg>`. Kept for compatibility. */
  ChaiLanguageFilterSelect as LanguageSelector,
} from "~/builder/register-apis/register-chai-language-selector";

export {
  /** @deprecated Use `getRegisteredChaiLibrary` from `<pkg>`. Kept for compatibility. */
  getRegisteredChaiLibrary as getChaiLibrary,
  /** @deprecated Use `useRegisteredChaiLibraries` from `<pkg>`. Kept for compatibility. */
  useRegisteredChaiLibraries as useChaiLibraries,
} from "~/builder/register-apis/register-chai-library";

export {
  /** @deprecated Use `CHAI_MEDIA_MANAGER_TABS` from `<pkg>`. Kept for compatibility. */
  CHAI_MEDIA_MANAGER_TABS as MEDIA_MANAGER_TABS,
} from "~/builder/register-apis/register-chai-media-manager-tab";

export {
  /** @deprecated Use `runChaiPreImportHtmlHook` from `<pkg>`. Kept for compatibility. */
  runChaiPreImportHtmlHook as getPreImportHTML,
  /** @deprecated Use `registerChaiPreImportHtmlHook` from `<pkg>`. Kept for compatibility. */
  registerChaiPreImportHtmlHook as registerChaiPreImportHTMLHook,
} from "~/builder/register-apis/register-chai-pre-import-html-hook";

export {
  /** @deprecated Use `resetChaiSaveToLibraryForTests` from `<pkg>`. Kept for compatibility. */
  resetChaiSaveToLibraryForTests as resetSaveToLibrary,
  /** @deprecated Use `ChaiSaveToLibraryProps` from `<pkg>`. Kept for compatibility. */
  type ChaiSaveToLibraryProps as SaveToLibraryProps,
  /** @deprecated Use `useRegisteredChaiSaveToLibrary` from `<pkg>`. Kept for compatibility. */
  useRegisteredChaiSaveToLibrary as useSaveToLibraryComponent,
} from "~/builder/register-apis/register-chai-save-to-library";

export {
  /** @deprecated Use `CHAI_SIDEBAR_PANEL_DEFAULT_ORDER` from `<pkg>`. Kept for compatibility. */
  CHAI_SIDEBAR_PANEL_DEFAULT_ORDER as DEFAULT_SIDEBAR_PANEL_ORDER,
  /** @deprecated Use `CHAI_SIDEBAR_PANEL_PINNED_ORDER` from `<pkg>`. Kept for compatibility. */
  CHAI_SIDEBAR_PANEL_PINNED_ORDER as FIXED_SIDEBAR_PANEL_ORDER,
} from "~/builder/register-apis/sidebar-panel-order";

export {
  /** @deprecated Use `useChaiTranslation` from `<pkg>`. Kept for compatibility. */
  useTranslation,
} from "react-i18next";
