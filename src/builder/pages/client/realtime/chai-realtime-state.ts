import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiAuth } from "~/builder/pages/hooks/use-chai-auth";
import { isChaiRealtimeEnabled } from "./chai-realtime-transport";

/** One client's presence entry: which page it has open, and since when. */
export type ChaiOnlineUser = {
  pageId: string;
  userId: string;
  clientId: string;
  onlineAt: number;
};

export const PAGE_STATUS = {
  LOCKED: "LOCKED",
  EDITING: "EDITING",
  CHECKING: "CHECKING",
  TAKE_OVER_REQUESTED: "TAKE_OVER_REQUESTED",
  ACTIVE_IN_ANOTHER_TAB: "ACTIVE_IN_ANOTHER_TAB",
  FORCE_TAKE_OVER: "FORCE_TAKE_OVER",
  CONNECTION_LOST: "CONNECTION_LOST",
  /** An AI/MCP edit session holds the page; the builder waits until it ends. */
  AI_EDITING: "AI_EDITING",
} as const;

export type ChaiPageStatus = (typeof PAGE_STATUS)[keyof typeof PAGE_STATUS];

/** pageId -> the client that owns the edit lock on it. Written by the realtime plugin. */
export const pageUserMapAtom = atom<Record<string, ChaiOnlineUser>>({});
export const pageStatusAtom = atom<ChaiPageStatus>(PAGE_STATUS.CHECKING);
export const pageLockMetaAtom = atom<any>({});

/**
 * An AI edit session's lease on the current page, as the host reports it. Held by an
 * agent working through MCP (or any other AI surface the host tracks) between its
 * tool calls, so a person opening the page does not overwrite the agent's work.
 */
export type ChaiAiPageEditLease = {
  pageId: string;
  /** User whose AI session holds the page — resolvable through GET_CHAI_USER. */
  userId: string;
  /** Label of the credential the session runs under (e.g. the MCP token name). */
  tokenLabel?: string;
  /** Last tool the session ran on the page. */
  lastTool?: string;
  startedAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

/**
 * The current page's AI lease: `undefined` until the first check for this page has
 * answered, then the active lease or `null`. Written only by the realtime plugin's
 * lease poll — never by presence — so the two sources cannot fight over
 * `pageStatusAtom`; `useChaiPageLockStatus` combines them.
 */
export const aiPageEditLeaseAtom = atom<ChaiAiPageEditLease | null | undefined>(undefined);

/**
 * The page `aiPageEditLeaseAtom` answers for. An answer carried over from the page
 * that was open before (or from before one had loaded) says nothing about this one,
 * so anything that acts on "no lease" has to check this first.
 */
export const aiPageEditLeasePageIdAtom = atom<string | undefined>(undefined);

/**
 * Every active AI edit session on the site, by page id — what the pages list marks with
 * its AI lock icon. Written by the realtime plugin's site-wide poll; empty without it.
 */
export const aiPageEditsAtom = atom<Record<string, ChaiAiPageEditLease>>({});

/** Statuses in which the page must not accept edits from this client. */
const LOCKED_STATUSES: ChaiPageStatus[] = [
  PAGE_STATUS.LOCKED,
  PAGE_STATUS.ACTIVE_IN_ANOTHER_TAB,
  PAGE_STATUS.CHECKING,
  PAGE_STATUS.AI_EDITING,
];

/**
 * @returns
 * { pageId: { pageId: string; userId: string; clientId: string; onlineAt: number }}
 */
export const useChaiPageLocks = () => {
  const [pageToUser, setPageToUser] = useAtom(pageUserMapAtom);
  return { pageToUser, setPageToUser };
};

/**
 * Presence-derived status combined with the AI lease.
 *
 * - An active lease overrides CHECKING (this client is about to claim the page). It
 *   never overrides EDITING: a person already editing keeps the page, because MCP's
 *   presence check fails open and a lease taken under them must not evict them. A
 *   page another person holds stays LOCKED: that is the more actionable state.
 * - Until the first lease check has answered, EDITING is held at CHECKING so the
 *   editor never opens editable for a moment on a page an agent is working on.
 */
export const resolvePageStatus = (
  trackedStatus: ChaiPageStatus,
  aiLease: ChaiAiPageEditLease | null | undefined,
): ChaiPageStatus => {
  if (aiLease && trackedStatus === PAGE_STATUS.CHECKING) {
    return PAGE_STATUS.AI_EDITING;
  }
  if (aiLease === undefined && trackedStatus === PAGE_STATUS.EDITING) {
    return PAGE_STATUS.CHECKING;
  }
  return trackedStatus;
};

/**
 * The current page's lock state. Without the realtime plugin nobody else can be
 * holding the page, so this reports a plain editing session — never CHECKING, which
 * would otherwise leave the editor blurred behind a loader forever.
 */
export const useChaiPageLockStatus = () => {
  const [trackedStatus, setPageStatus] = useAtom(pageStatusAtom);
  const aiLease = useAtomValue(aiPageEditLeaseAtom);
  const pageStatus: ChaiPageStatus = isChaiRealtimeEnabled()
    ? resolvePageStatus(trackedStatus, aiLease)
    : PAGE_STATUS.EDITING;
  const isLocked = LOCKED_STATUSES.includes(pageStatus);
  const isEditing = pageStatus === PAGE_STATUS.EDITING;
  return { pageStatus, setPageStatus, isLocked, isEditing };
};

export const useAiPageEditLease = () => {
  const [aiLease, setLease] = useAtom(aiPageEditLeaseAtom);
  const [aiLeasePageId, setLeasePageId] = useAtom(aiPageEditLeasePageIdAtom);
  const setAiLease = useCallback(
    (lease: ChaiAiPageEditLease | null | undefined, pageId?: string) => {
      setLease(lease);
      setLeasePageId(pageId);
    },
    [setLease, setLeasePageId],
  );
  return { aiLease, aiLeasePageId, setAiLease };
};

/** Active AI edit sessions on the site, by page id (see `aiPageEditsAtom`). */
export const useAiPageEdits = () => {
  const [aiPageEdits, setAiPageEdits] = useAtom(aiPageEditsAtom);
  return { aiPageEdits, setAiPageEdits };
};

export const usePageLockMeta = () => {
  const [pageLockMeta, setPageLockMeta] = useAtom(pageLockMetaAtom);
  return { pageLockMeta, setPageLockMeta };
};

/**
 * @returns
 * null | { pageId: string; userId: string; clientId: string; onlineAt: number }
 */
export const useChaiPageLockOwner = () => {
  const pageId = usePageId();
  const { pageToUser } = useChaiPageLocks();
  return useMemo(() => pageToUser[pageId], [pageToUser, pageId]);
};

export const useUserId = () => {
  const { user: chaiUser } = useChaiAuth();
  return chaiUser?.id;
};

export const usePageId = () => {
  const { data: currentPage } = usePrimaryPage();
  return currentPage?.id;
};
