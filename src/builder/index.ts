import { NestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { useChaiCurrentPage, useCurrentActivePage } from "~/builder/pages/hooks/pages/use-current-page";
import { usePageAllData } from "~/builder/pages/hooks/pages/use-page-all-data";
import { useBuilderPageData } from "~/builder/pages/hooks/pages/use-page-draft-blocks";
import { useSiteGlobalData } from "~/builder/pages/hooks/pages/use-site-global-data";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useGotoPage } from "~/builder/pages/hooks/use-goto-page";
import { useClearAll, useReloadPage } from "~/builder/pages/hooks/use-reload-page";
import { useUpdateActivePageMetadata } from "~/builder/pages/hooks/use-update-metadata";
import { defaultChaiLibrary, useTranslation } from "./core/main";
import { CHAI_PACKAGE_NAME } from "~/edition/identity";
import { useSavePage } from "./hooks/use-save-page";
import { ChaiWebsiteBuilder } from "./pages/chaibuilder-pages";

if (typeof window === "undefined") {
  throw new Error(`${CHAI_PACKAGE_NAME} is not available on the server`);
}

export { PermissionChecker } from "~/builder/pages/client/components/permission-checker";
export { SmartJsonInput as ChaiJsonInput } from "~/builder/pages/client/components/smart-json-input";
export { LanguageSwitcher } from "~/builder/pages/client/components/topbar-left";
export { ImagePicker } from "~/builder/pages/digital-asset-manager/image-picker";
export {
  AiPanelContent as ChaiAiPanel,
  type AiPanelContentProps as ChaiAiPanelProps,
} from "~/builder/pages/panels/ai-panel/ai-panel-content";
export { ChaiWebsiteBuilder, NestedPathSelector };

/** Hooks */
export { usePrimaryPage as useChaiPrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
export { useLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
export { useWebsitePrimaryPages as useWebsitePages } from "~/builder/pages/hooks/pages/use-project-pages";
export { useApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
export { useWebsiteSetting } from "~/builder/pages/hooks/project/use-website-settings";
export { useChaiAuth } from "~/builder/pages/hooks/use-chai-auth";
export { useCheckUserAccess as useUserPermissions } from "~/builder/pages/hooks/user/use-check-access";
export { useChaiUserInfo } from "~/builder/pages/hooks/utils/use-chai-user-info";
export { useBuilderFetch, useFetch } from "~/builder/pages/hooks/utils/use-fetch";
export {
  useCurrentActivePage as useActivePage,
  useBuilderPageData,
  useChaiCurrentPage,
  useClearAll,
  useFallbackLang,
  useGotoPage,
  usePageAllData,
  usePageTypes,
  useReloadPage,
  useSavePage,
  useSiteGlobalData,
  useTranslation,
  useUpdateActivePageMetadata,
};

/**
 * Realtime contract. The feature itself ships as the `chai:realtime` client plugin
 * (`<pkg>/plugins/realtime/client`, pro editions); these read the state it publishes and are
 * safe to call with the plugin absent — the page then reads as unlocked.
 */
export {
  PAGE_STATUS as CHAI_PAGE_STATUS,
  isChaiRealtimeEnabled,
  useCurrentPageOwner,
  usePageLockStatus,
  usePageToUser,
  type ChaiOnlineUser,
  type ChaiPageStatus,
} from "~/builder/pages/client/realtime";

export * from "./register-apis";
export { defaultChaiLibrary };
