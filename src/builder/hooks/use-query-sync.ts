import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { SetStateAction, useAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { useSendRealtimeEvent } from "~/builder/pages/client/realtime";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { ChaiPage, ChaiSiteSettings } from "~/types/actions";
import { ChaiTheme } from "~/types/chaibuilder-editor-props";
import { ChaiDesignTokens } from "~/types/types";
import { chaiThemeValuesAtom } from "./use-theme";

type SyncPayload = {
  type: string;
  data: SyncData;
  sync?: boolean;
  userId?: string;
  userName?: string;
};

type SyncData = {
  settings?: Partial<ChaiSiteSettings>;
  pageId?: string;
  designTokens?: ChaiDesignTokens;
  linkPageIds?: string[];
  partialIds?: string[];
  ids?: string[];
  primaryPage?: string;
};

type AppChanges = string[];

type UpdateQueryDataParams = {
  queryClient: QueryClient;
  queryKey: unknown[];
  data: Partial<ChaiSiteSettings>;
  setTheme?: (theme: SetStateAction<ChaiTheme | Partial<ChaiTheme>>) => void;
  setDesignTokens?: (tokens: ChaiDesignTokens) => void;
};

type UpdatePageDataParams = {
  queryClient: QueryClient;
  pageId: string;
  designTokens: ChaiDesignTokens;
  linkPageIds: string[];
  partialIds: string[];
};

type PublishChangesParams = {
  queryClient: QueryClient;
  ids: string[];
  sync: boolean;
};

type UnpublishPageParams = {
  queryClient: QueryClient;
  pageId: string;
  primaryPage?: string;
};

/**
 * Track theme changes in appChanges array
 */
const trackThemeChanges = (
  appChanges: AppChanges,
  data: Partial<ChaiSiteSettings>,
  setTheme?: (theme: SetStateAction<ChaiTheme | Partial<ChaiTheme>>) => void,
): AppChanges => {
  if (appChanges.includes("THEME") || data?.theme !== undefined) {
    appChanges.push("THEME");
    if (setTheme && data?.theme) {
      setTheme(data.theme);
    }
  }
  return appChanges;
};

/**
 * Track design token changes in appChanges array
 */
const trackDesignTokenChanges = (
  appChanges: AppChanges,
  data: Partial<ChaiSiteSettings>,
  setDesignTokens?: (tokens: ChaiDesignTokens) => void,
): AppChanges => {
  if (appChanges.includes("DESIGN_TOKENS") || data?.designTokens !== undefined) {
    appChanges.push("DESIGN_TOKENS");
    if (setDesignTokens && data.designTokens) {
      setDesignTokens(data.designTokens);
    }
  }
  return appChanges;
};

/**
 * Merge old data with new data and track changes
 */
const mergeDataWithChanges = (
  oldData: ChaiSiteSettings | undefined,
  data: Partial<ChaiSiteSettings>,
  setTheme?: (theme: SetStateAction<ChaiTheme | Partial<ChaiTheme>>) => void,
  setDesignTokens?: (tokens: ChaiDesignTokens) => void,
): ChaiSiteSettings | Partial<ChaiSiteSettings> => {
  let appChanges = oldData?.appChanges || [];

  appChanges = trackThemeChanges(appChanges, data, setTheme);
  appChanges = trackDesignTokenChanges(appChanges, data, setDesignTokens);

  if (!oldData) return data;
  return {
    ...oldData,
    ...data,
    appChanges,
  };
};

/**
 * Update QueryClient cache directly without refetching
 */
const updateQueryData = ({ queryClient, queryKey, data, setTheme, setDesignTokens }: UpdateQueryDataParams): void => {
  queryClient.setQueryData(queryKey, (oldData: ChaiSiteSettings | undefined) =>
    mergeDataWithChanges(oldData, data, setTheme, setDesignTokens),
  );
};

/**
 * Update a specific page's data in the pages list
 */
const updatePageInList = (
  page: ChaiPage,
  pageId: string,
  designTokens: ChaiDesignTokens,
  linkPageIds: string,
  partialIds: string,
): ChaiPage => {
  if (page.id === pageId) {
    return {
      ...page,
      designTokens,
      links: linkPageIds,
      partialBlocks: partialIds,
      changes: [{ type: "Page" }],
    };
  }
  return page;
};

/**
 * Update page data in the query cache
 */
const updatePageData = ({ queryClient, pageId, designTokens, linkPageIds, partialIds }: UpdatePageDataParams): void => {
  queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], (oldData: ChaiPage[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;

    //Before sending linkIds and parttialIds we need to convert these array in to string
    const linkPageIdsString = linkPageIds.join(" | ");
    const partialIdsString = partialIds.join(" | ");

    return oldData.map((page) => updatePageInList(page, pageId, designTokens, linkPageIdsString, partialIdsString));
  });
};

/**
 * Handle website data synchronization
 */
const handleWebsiteDataSync = (
  queryClient: QueryClient,
  data: SyncData,
  sync: boolean,
  userName: string | undefined,
  t: (key: string, options?: any) => string,
  setChaiTheme?: (theme: SetStateAction<ChaiTheme | Partial<ChaiTheme>>) => void,
  setDesignTokens?: (tokens: ChaiDesignTokens) => void,
): void => {
  if (data.settings) {
    updateQueryData({
      queryClient,
      queryKey: [ACTIONS.GET_WEBSITE_DRAFT_SETTINGS],
      data: data.settings,
      setTheme: setChaiTheme,
      setDesignTokens,
    });

    if (!sync && userName) {
      if (data.settings.theme !== undefined) {
        toast.success(t("Theme Updated"), {
          description: t("{{userName}} updated the theme", { userName }),
          position: "bottom-left",
        });
      }
      if (data.settings.designTokens !== undefined) {
        toast.success(t("Design Tokens Updated"), {
          description: t("{{userName}} updated the design tokens", {
            userName,
          }),
          position: "bottom-left",
        });
      }
    }
  }
};

/**
 * Handle page data synchronization
 */
const handlePageDataSync = (queryClient: QueryClient, data: SyncData): void => {
  if (data.pageId && data.designTokens && data.linkPageIds && data.partialIds) {
    updatePageData({
      queryClient,
      pageId: data.pageId,
      designTokens: data.designTokens,
      linkPageIds: data.linkPageIds,
      partialIds: data.partialIds,
    });
  }
};

/**
 * Clear changes array for a published page
 */
const clearPageChanges = (page: ChaiPage, publishedIds: string[]): ChaiPage => {
  if (publishedIds.includes(page.id)) {
    return {
      ...page,
      changes: [],
      online: true,
    };
  }
  return page;
};

/**
 * Clear appChanges for published THEME or DESIGN_TOKENS
 */
const clearAppChanges = (
  oldData: ChaiSiteSettings | undefined,
  publishedIds: string[],
): ChaiSiteSettings | undefined => {
  if (!oldData) return oldData;

  const appChanges = oldData.appChanges || [];
  const updatedAppChanges = appChanges.filter((change) => !publishedIds.includes(change));

  return {
    ...oldData,
    appChanges: updatedAppChanges,
  };
};

/**
 * Handle publish changes - clear changes arrays for published items
 */
const handlePublishChanges = ({ queryClient, ids }: PublishChangesParams): void => {
  queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], (oldData: ChaiPage[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.map((page) => clearPageChanges(page, ids));
  });

  queryClient.setQueryData([ACTIONS.GET_LANGUAGE_PAGES], (oldData: ChaiPage[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.map((page) => clearPageChanges(page, ids));
  });

  if (ids.includes("THEME") || ids.includes("DESIGN_TOKENS")) {
    queryClient.setQueryData([ACTIONS.GET_WEBSITE_DRAFT_SETTINGS], (oldData: ChaiSiteSettings | undefined) =>
      clearAppChanges(oldData, ids),
    );
  }
  queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_CHANGES], refetchType: "all" });
};

/**
 * Set page offline status
 */
const setPageOffline = (page: ChaiPage, pageId: string): ChaiPage => {
  if (page.id === pageId) {
    return {
      ...page,
      online: false,
    };
  }
  return page;
};

/**
 * Handle unpublish page - set page offline status
 */
const handleUnpublishPage = ({ queryClient, pageId, primaryPage }: UnpublishPageParams): void => {
  if (primaryPage) {
    queryClient.setQueryData([ACTIONS.GET_LANGUAGE_PAGES, primaryPage], (oldData: ChaiPage[] | undefined) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((page) => setPageOffline(page, pageId));
    });
  } else {
    queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], (oldData: ChaiPage[] | undefined) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((page) => setPageOffline(page, pageId));
    });
  }
  queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_CHANGES], refetchType: "all" });
};

/**
 * Send realtime event if sync is enabled
 */
const sendRealtimeEventIfNeeded = (
  sync: boolean,
  sendEvent: (type: string, payload: { data: SyncData }) => Promise<void>,
  type: string,
  data: SyncData,
): void => {
  if (sync) {
    sendEvent(type, { data });
  }
};

/**
 * Process sync payload based on type
 */
const processSyncPayload = (
  payload: SyncPayload,
  queryClient: QueryClient,
  setChaiTheme: (theme: SetStateAction<ChaiTheme | Partial<ChaiTheme>>) => void,
  setDesignTokens: (tokens: ChaiDesignTokens) => void,
  t: (key: string, options?: any) => string,
): boolean => {
  const { type, data, sync = false, userName } = payload;

  switch (type) {
    case "UPDATE_WEBSITE_DATA":
      handleWebsiteDataSync(queryClient, data, sync, userName, t, setChaiTheme, setDesignTokens);
      break;

    case "UPDATE_PAGE_DATA":
      handlePageDataSync(queryClient, data);
      break;

    case "PUBLISH_CHANGES":
      if (data.ids) {
        handlePublishChanges({ queryClient, ids: data.ids, sync });
      }
      break;

    case "UNPUBLISH_PAGE":
      if (data.pageId) {
        handleUnpublishPage({
          queryClient,
          pageId: data.pageId,
          primaryPage: data.primaryPage,
        });
      }
      break;

    default:
      console.log(t("Unknown sync type"), type);
  }

  return sync;
};

export const useQuerySync = () => {
  const queryClient = useQueryClient();
  const sendEvent = useSendRealtimeEvent();
  const [_, setChaiTheme] = useAtom(chaiThemeValuesAtom);
  const [, setDesignTokensAtom] = useAtom(chaiDesignTokensAtom);
  const { t } = useTranslation();

  const setDesignTokens = useCallback(
    (tokens: ChaiDesignTokens) => {
      setDesignTokensAtom(tokens);
    },
    [setDesignTokensAtom],
  );

  const handleQuerySync = useCallback(
    (payload: SyncPayload) => {
      const shouldSync = processSyncPayload(payload, queryClient, setChaiTheme, setDesignTokens, t);
      sendRealtimeEventIfNeeded(shouldSync, sendEvent, payload.type, payload.data);
    },
    [queryClient, sendEvent, setChaiTheme, setDesignTokens, t],
  );

  return {
    handleQuerySync,
  };
};
