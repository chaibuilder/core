import { getSiteSettings } from "../public/get-site-settings";
import { getRequestState, verifyInit } from "../state";

export const loadSiteSettings = async (_draftMode: boolean): Promise<void> => {
  verifyInit();
  const siteSettings = await getSiteSettings();
  setFallbackLang(siteSettings?.fallbackLang || "en");
};

export const getAppId = (): string | null => {
  return getRequestState().appId;
};

export const setAppId = (appId: string): void => {
  getRequestState().appId = appId;
};

export const setDraftMode = (draftMode: boolean): void => {
  const state = verifyInit();
  state.draftMode = draftMode;
};

/**
 * Site default language. Seeded by `getPagePayload` on the page path; any other
 * entry point (data providers, sitemap/feed builders, `resolveLink` outside a
 * page render) lands on a fresh request state, so read it from the cached site
 * settings instead of a literal — a hardcoded "en" made `resolveLink(ref, "en")`
 * return the French primary slug on French-default sites.
 */
export const getFallbackLang = async (): Promise<string> => {
  const state = verifyInit();
  if (state.fallbackLang) return state.fallbackLang;
  const siteSettings = await getSiteSettings().catch(() => null);
  // Seed even on a failed lookup: one answer per request state beats re-querying.
  state.fallbackLang = siteSettings?.fallbackLang || "en";
  return state.fallbackLang;
};

export const setFallbackLang = (lang: string): void => {
  const state = verifyInit();
  state.fallbackLang = lang;
};

export const getLang = (): string | null => {
  const state = verifyInit();
  return state.lang;
};

export const setLang = (lang: string | null): void => {
  const state = verifyInit();
  state.lang = lang;
};

export const getSiteUrl = (): string | null => {
  return getRequestState().siteUrl;
};

export const setSiteUrl = (siteUrl: string | null): void => {
  getRequestState().siteUrl = siteUrl;
};

export const initState = (appId: string, draftMode: boolean, siteUrl?: string | null): void => {
  const state = getRequestState();
  state.appId = appId;
  state.userId = null;
  state.draftMode = draftMode;
  state.initialized = true;
  state.siteUrl = siteUrl ?? null;
};

export const initStateWithUser = (appId: string, userId: string, draftMode: boolean, siteUrl?: string | null): void => {
  const state = getRequestState();
  state.appId = appId;
  state.userId = userId;
  state.draftMode = draftMode;
  state.initialized = true;
  state.siteUrl = siteUrl ?? null;
};
