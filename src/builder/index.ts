import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { useChaiCurrentPage, useChaiActivePage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiPageData } from "~/builder/pages/hooks/pages/use-page-all-data";
import { useChaiPageBindingData } from "~/builder/pages/hooks/pages/use-page-draft-blocks";
import { useChaiSiteGlobalData } from "~/builder/pages/hooks/pages/use-site-global-data";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useChaiGotoPage } from "~/builder/pages/hooks/use-goto-page";
import { useChaiClearQueryCache, useChaiReloadPage } from "~/builder/pages/hooks/use-reload-page";
import { useChaiUpdateActivePageMetadata } from "~/builder/pages/hooks/use-update-metadata";
import { createDefaultChaiLibrary, useTranslation } from "./core/main";
import { CHAI_PACKAGE_NAME } from "~/edition/identity";
import { useChaiSavePage } from "./hooks/use-save-page";
import { ChaiWebsiteBuilder } from "./pages/chaibuilder-pages";

if (typeof window === "undefined") {
  throw new Error(`${CHAI_PACKAGE_NAME} is not available on the server`);
}

export { IfChaiPermission } from "~/builder/pages/client/components/permission-checker";
export { SmartJsonInput as ChaiJsonInput } from "~/builder/pages/client/components/smart-json-input";
export { ChaiLanguageSwitcher } from "~/builder/pages/client/components/topbar-left";
export { ChaiImagePicker } from "~/builder/pages/digital-asset-manager/image-picker";
export {
  AiPanelContent as ChaiAiPanel,
  type AiPanelContentProps as ChaiAiPanelProps,
} from "~/builder/pages/panels/ai-panel/ai-panel-content";
export { ChaiWebsiteBuilder, ChaiNestedPathSelector };

/** Hooks */
export { usePrimaryPage as useChaiPrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
export { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
export { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
export { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
export { useChaiSiteSettings } from "~/builder/pages/hooks/project/use-website-settings";
export { useChaiAuth } from "~/builder/pages/hooks/use-chai-auth";
export { useChaiUserPermissions } from "~/builder/pages/hooks/user/use-check-access";
export { useChaiUserInfo } from "~/builder/pages/hooks/utils/use-chai-user-info";
export { useChaiActionFetch } from "~/builder/pages/hooks/utils/use-fetch";
export {
  useChaiActivePage,
  useChaiPageBindingData,
  useChaiCurrentPage,
  useChaiClearQueryCache,
  useChaiFallbackLang,
  useChaiGotoPage,
  useChaiPageData,
  useChaiPageTypes,
  useChaiReloadPage,
  useChaiSavePage,
  useChaiSiteGlobalData,
  useTranslation as useChaiTranslation,
  useChaiUpdateActivePageMetadata,
};

/**
 * Realtime contract. The feature itself ships as the `chai:realtime` client plugin
 * (`<pkg>/plugins/realtime/client`, pro editions); these read the state it publishes and are
 * safe to call with the plugin absent — the page then reads as unlocked.
 */
export {
  PAGE_STATUS as CHAI_PAGE_STATUS,
  isChaiRealtimeEnabled,
  useChaiPageLockOwner,
  useChaiPageLockStatus,
  useChaiPageLocks,
  type ChaiOnlineUser,
  type ChaiPageStatus,
} from "~/builder/pages/client/realtime";

export * from "./register-apis";
export { createDefaultChaiLibrary };

// Deprecated names, kept for compatibility. See ./deprecated.ts.
export * from "./deprecated";
