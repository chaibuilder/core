import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { cloneDeep, get, isPlainObject } from "lodash-es";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { ChaiBuilderEditor } from "~/builder/core/main";
import { pubsub } from "~/builder/core/pubsub";
import { useBuilderThemeEffect } from "~/builder/hooks/use-builder-theme";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { Topbar } from "~/builder/pages/extensions/topbar";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useExtractPageBlocks } from "~/builder/pages/hooks/pages/use-extract-page-blocks";
import { usePageAllData } from "~/builder/pages/hooks/pages/use-page-all-data";
import { useUpdateWebsiteFields } from "~/builder/pages/hooks/project/mutations";
import { useSearchPageTypePages } from "~/builder/pages/hooks/project/use-page-types";
import { useCheckUserAccess } from "~/builder/pages/hooks/user/use-check-access";
import { usePagesSavePage } from "~/builder/pages/hooks/utils/use-chai-api";
import { serverConfigAtom, usePagesProps } from "~/builder/pages/hooks/utils/use-pages-props";
import { usePartialBlocksFn } from "~/builder/pages/hooks/utils/use-partial-blocks";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { registerChaiPanels } from "~/builder/pages/panels";
import { registerChaiSlot } from "~/builder/register-apis";
import { registerChaiClientPlugins } from "~/builder/register-apis/register-chai-plugin";
import { Button } from "~/components/ui/button";
import { Loading } from "~/components/ui/loader";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { ChaiBlock, ChaiWebsiteBuilderProps } from "~/types/common";
import { loadWebBlocks } from "~/web-blocks";
import { BlurContainer, FullscreenLoader } from "../../components/ui/loader";
import { previewUrlAtom } from "./atom/preview-url";
import { PAGE_STATUS, usePageLockStatus } from "./client/realtime";
import { registerPagesFeatureFlags } from "./feature-flags";
import { useBuilderPageProps } from "./hooks/pages/use-builder-page-props";
import { useBuilderPageData } from "./hooks/pages/use-page-draft-blocks";
import { useSiteGlobalData } from "./hooks/pages/use-site-global-data";
import { useGetBlockAysncProps } from "./hooks/use-chai-collections";
import { useGotoPage } from "./hooks/use-goto-page";
import { useSiteWideUsage } from "./hooks/use-site-wide-usage";
import { useWebsiteData } from "./hooks/use-website-data";
import { buildPageBindingData } from "~/utils/page-binding-data";
import { aiPanelId } from "./panels/ai-panel/ai-panel";

const DigitalAssetManager = lazy(() => import("~/builder/pages/digital-asset-manager/digital-asset-manager"));
const PreviewWeb = lazy(() => import("~/builder/pages/client/components/web-preview"));
const PagesManagerSheet = lazy(() => import("~/builder/pages/client/components/page-manager/page-manager-sheet"));

registerPagesFeatureFlags();
loadWebBlocks();
registerChaiPanels();
//slots
registerChaiSlot(CHAI_SLOT_IDS.TOP_BAR, Topbar);
registerChaiSlot(CHAI_SLOT_IDS.MEDIA_MANAGER, DigitalAssetManager);
// Save-to-library moved to libraryClientPlugin (chai:library) — hosts that want
// the site library register it alongside the server-side libraryPlugin().

const DEFAULT_ROLES_AND_PERMISSIONS = {
  role: "admin",
  permissions: null,
};

// Stable identity for the fetching state — a fresh [] per render would refire the
// editor's blocks watcher on every render and stack redundant store resets.
const EMPTY_BLOCKS: ChaiBlock[] = [];

/**
 *
 * @returns CHAIBUILDER PAGES COMPONENT
 */
const BuilderWithAccessCheck = (props: ChaiWebsiteBuilderProps) => {
  const { isLoading } = useCheckUserAccess();

  if (isLoading) return <FullscreenLoader />;

  return <DefaultChaiBuilder {...props} />;
};

const DefaultChaiBuilder = (props: ChaiWebsiteBuilderProps) => {
  const { data: websiteData, isFetching: isWebsiteDataFetching, isError } = useWebsiteData();
  const setServerConfig = useSetAtom(serverConfigAtom);
  const serverConfig = useAtomValue(serverConfigAtom);

  useEffect(() => {
    if (!websiteData) return;
    // `redirects` is dropped: the redirects panel reads it straight off websiteData.features.
    const { redirects: _redirects, ...features } = websiteData.features ?? {};
    setServerConfig({
      features,
      ai: websiteData.ai ?? {},
      mediaManager: websiteData.mediaManager ?? {},
    });
  }, [websiteData, setServerConfig]);

  // Show loader until websiteData is resolved and the server config is merged (cache gets populated first)
  if (!websiteData || isWebsiteDataFetching || serverConfig === null) {
    return <FullscreenLoader />;
  }

  if (isError) {
    return (
      <BlurContainer className="bg-surface text-foreground fixed inset-0">
        <p>Failed to load website data</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </BlurContainer>
    );
  }

  // Once resolved, render the editor — all child hooks will find data in cache
  return <ChaiBuilderInner {...props} />;
};

type ChaiBuilderInnerProps = ChaiWebsiteBuilderProps;

const ChaiBuilderInner = ({ ...props }: ChaiBuilderInnerProps) => {
  const { data: websiteData } = useWebsiteData();
  const serverConfig = useAtomValue(serverConfigAtom);
  const { data: siteWideUsage } = useSiteWideUsage();
  const { collections, repeaterData, pageTypes, libraries, websiteSettings: websiteConfig } = websiteData as any;
  const fallbackLang = useMemo(() => websiteConfig?.fallbackLang || "en", [websiteConfig]);
  const { data: accessData, isFetching: isFetchingAccessData } = useCheckUserAccess();
  const roleAndPermissions = accessData || DEFAULT_ROLES_AND_PERMISSIONS;
  // * PAGE DATA
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");
  const { data: currentPage } = usePrimaryPage();
  const { data: pageData, isFetching: isFetchingPageAllData } = usePageAllData();
  const { data: globalData } = useSiteGlobalData();
  const { data: builderPageData } = useBuilderPageData();
  const pageProps = useBuilderPageProps();
  const { blocks } = useExtractPageBlocks(pageData?.draftPage?.blocks ?? []);
  const { pageStatus } = usePageLockStatus();
  const { mutateAsync: getBlockAsyncProps } = useGetBlockAysncProps();
  // * ACTIONS
  const { onSave } = usePagesSavePage();
  const { getPartialBlocks, getPartialBlockBlocks } = usePartialBlocksFn();
  const { searchPages } = useSearchPageTypePages();
  const { mutateAsync: updateSettings } = useUpdateWebsiteFields();
  const gotoPage = useGotoPage();

  // * STATES
  const [tabHidden, setTabHidden] = useState(false);

  // * UTILS
  const blocksDataRef = useRef([] as any);
  const currentTheme = useMemo(() => get(websiteConfig, "theme", {}) || {}, [websiteConfig]);
  const websiteLanguages = useMemo(() => get(websiteConfig, "languages", []) || [], [websiteConfig]);
  const websiteDesignTokens = useMemo(() => get(websiteConfig, "designTokens", {}) || {}, [websiteConfig]);
  const isEditing = pageStatus === PAGE_STATUS.EDITING;
  const isCheckingPageLock = pageStatus === PAGE_STATUS.CHECKING;
  const isFetchingPageData = isFetchingPageAllData || isCheckingPageLock;
  const [, setActivePanel] = useSidebarActivePanel();

  useEffect(() => {
    blocksDataRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    const unsub = pubsub.subscribe(CHAI_BUILDER_EVENTS.OPEN_AI_PANEL, () => {
      setActivePanel(aiPanelId);
    });
    return () => unsub();
  }, [setActivePanel]);

  //Show Preview
  const [previewUrl] = useAtom(previewUrlAtom);

  // * EFFECTS to control tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabHidden(true);
      } else {
        setTabHidden(false);
      }
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => window.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // * FORWARD PROPS
  const forwardedProps = useMemo(() => {
    const editorProps: any = {};
    if (roleAndPermissions) {
      editorProps.permissions = get(roleAndPermissions, "permissions", null);
      editorProps.role = get(roleAndPermissions, "role", "user");
    }
    editorProps.pageExternalData = {
      ...(builderPageData ?? {}),
      global: globalData ?? {},
      page: { ...(isPlainObject(get(builderPageData, "page")) ? get(builderPageData, "page") : {}), ...buildPageBindingData(pageProps) },
    };
    return editorProps;
  }, [roleAndPermissions, builderPageData, globalData, pageProps]);

  // Straight off the website data — registering the libraries with the builder
  // (browse tab entries) is the library client plugin's job, not core's.
  const isLibrarySite = useMemo(() => {
    return (libraries ?? []).some((library: any) => library.isSiteLibrary);
  }, [libraries]);

  return (
    <>
      {isFetchingPageAllData && (
        <BlurContainer>
          <Loading className={`transition-all ${isFetchingAccessData ? "h-6 w-6" : "h-5 w-5"}`} />
        </BlurContainer>
      )}
      {previewUrl && (
        <Suspense
          fallback={
            <div className="absolute inset-0 z-[999999] flex min-h-screen w-screen items-center justify-center bg-gray-100">
              <Loading className="text-primary h-6 w-6" />
            </div>
          }>
          <PreviewWeb />
        </Suspense>
      )}
      <ChaiBuilderEditor
        siteWideUsage={siteWideUsage ?? {}}
        flags={{ ...serverConfig?.features, librarySite: isLibrarySite }}
        gotoPage={gotoPage}
        collections={collections ?? []}
        chaiCollections={repeaterData ?? []}
        getBlockAsyncProps={getBlockAsyncProps}
        themePresets={props.themePresets ?? []}
        pageId={currentPage?.id}
        loading={isFetchingPageData}
        fallbackLang={fallbackLang}
        languages={websiteLanguages}
        brandingOptions={currentTheme}
        designTokens={websiteDesignTokens}
        translations={props.translations || {}}
        locale={props.locale || "en"}
        htmlDir={props.htmlDir || "ltr"}
        tailwindCSS={props.tailwindCSS ?? "4"}
        canvasStyles={props.canvasStyles}
        autoSave={!tabHidden && isEditing && (props.autoSave ?? true)}
        autoSaveActionsCount={props.autoSaveActionsCount ?? 10}
        onError={props.onError || console.error}
        getPartialBlockBlocks={getPartialBlockBlocks}
        getPartialBlocks={getPartialBlocks}
        blocks={isFetchingPageAllData ? EMPTY_BLOCKS : blocks}
        theme={cloneDeep(currentTheme)}
        pageTypes={pageTypes}
        searchPageTypeItems={searchPages}
        labels={props.labels}
        onSave={async ({ blocks: _blocks, needTranslations, partialIds, linkPageIds, designTokens }) => {
          if (!page) return true;
          blocksDataRef.current = _blocks;
          const updatedBlocks = [..._blocks];
          await onSave({
            page: page as string,
            blocks: updatedBlocks,
            needTranslations,
            partialIds,
            linkPageIds,
            designTokens,
          });
          blocksDataRef.current = updatedBlocks;
          return true;
        }}
        onSaveWebsiteData={async ({ type, data }) => {
          if (type === "THEME") {
            await updateSettings({ settings: { theme: data } });
          } else if (type === "DESIGN_TOKENS") {
            await updateSettings({ settings: { designTokens: data } });
          } else if (type === "THEME_AND_DESIGN_TOKENS") {
            await updateSettings({
              settings: { theme: data.theme, designTokens: data.designTokens },
            });
          }
          return true;
        }}
        {...forwardedProps}
      />
      {(serverConfig?.features?.pagesManager ?? true) && <PagesManagerSheet />}
    </>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

const ChaiWebsiteBuilder = (props: ChaiWebsiteBuilderProps) => {
  const [, setPagesProps] = usePagesProps();
  const setServerConfig = useSetAtom(serverConfigAtom);
  const [ready, setReady] = useState(false);
  useBuilderThemeEffect();
  // Register before children mount; once-per-name, so re-renders are no-ops.
  registerChaiClientPlugins(props.plugins);
  // Destructured so the memo below closes over these values alone and never over
  // `props` itself. React hands this component a fresh props object on every parent
  // re-render, and the effect's cleanup unmounts the whole tree (`setReady(false)`,
  // plus `setServerConfig(null)`) — so keying any of this on the props object made
  // the builder tear down and remount on each host render, i.e. reload in a loop.
  // Closing over the individual values keeps `react-hooks/exhaustive-deps` enabled,
  // so a newly forwarded prop is a lint error rather than a silent stale value.
  //
  // These were forwarded with `pick`, which omits absent keys, whereas the object
  // below always carries all nine. Equivalent here: every reader goes through
  // `get(pagesProps, path, default)` or `?.`, and lodash `get` falls back to the
  // default on `undefined`, so an absent key and an undefined one are the same.
  // (`usersApiUrl`, `assetsApiUrl` and `getLoggedInUser` were listed too, but exist
  // neither on ChaiWebsiteBuilderProps nor anywhere else, so `pick` always dropped
  // them before they reached `setPagesProps`.)
  const { apiUrl, getPreviewUrl, getLiveUrl, onLogout, getAccessToken, websocket, currentUser, beforeRequest, labels } =
    props;

  const pagesProps = useMemo(
    () => ({
      apiUrl,
      getPreviewUrl,
      getLiveUrl,
      onLogout,
      getAccessToken,
      websocket,
      currentUser,
      beforeRequest,
      labels,
    }),
    [apiUrl, getPreviewUrl, getLiveUrl, onLogout, getAccessToken, websocket, currentUser, beforeRequest, labels],
  );

  useEffect(() => {
    setPagesProps(pagesProps);
    const readyTimer = setTimeout(() => {
      setReady(true);
    }, 200);

    return () => {
      clearTimeout(readyTimer);
      setReady(false);
      setPagesProps({});
      setServerConfig(null);
    };
  }, [pagesProps, setPagesProps, setServerConfig]);

  if (!ready) return <FullscreenLoader />;

  // if not, create a new query client and wrap the builder with it
  // else rely on the parent app to provide the query client
  if (get(props, "hasReactQueryProvider", false) === true) return <BuilderWithAccessCheck {...props} />;

  return (
    <QueryClientProvider client={queryClient}>
      <BuilderWithAccessCheck {...props} />
    </QueryClientProvider>
  );
};

export { ChaiWebsiteBuilder };
