/**
 * The core half of the realtime feature: shared lock state plus the seam the
 * `chai:realtime` plugin plugs its transport into. Core UI (topbar, page manager,
 * publish sheet, query sync) reads from here and stays correct whether or not the
 * plugin is installed.
 */
export {
  PAGE_STATUS,
  aiPageEditLeaseAtom,
  aiPageEditLeasePageIdAtom,
  aiPageEditsAtom,
  pageLockMetaAtom,
  pageStatusAtom,
  pageUserMapAtom,
  resolvePageStatus,
  useAiPageEditLease,
  useAiPageEdits,
  useCurrentPageOwner,
  usePageId,
  usePageLockMeta,
  usePageLockStatus,
  usePageToUser,
  useUserId,
  type ChaiAiPageEditLease,
  type ChaiOnlineUser,
  type ChaiPageStatus,
} from "./chai-realtime-state";
export { formatClockTime, formatSince, isChaiAiPageEditActive } from "./ai-page-edit-time";
export {
  enableChaiRealtime,
  isChaiRealtimeEnabled,
  resetChaiRealtimeForTests,
  useRegisterChaiRealtimeSender,
  useSendRealtimeEvent,
  type ChaiRealtimeSender,
} from "./chai-realtime-transport";
