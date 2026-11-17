import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * Core side of the realtime contract.
 *
 * The realtime feature itself (presence, page locking, take-over dialogs) lives in
 * the `chai:realtime` client plugin. Core only knows two things about it: whether it
 * is installed, and how to hand it an event to broadcast. Everything else — the
 * transport, the channel, the Supabase client — is the plugin's business.
 *
 * With the plugin absent both halves degrade quietly: the editor reports itself as
 * the sole editor (see `useChaiPageLockStatus`) and broadcasts become no-ops.
 */

/** An event broadcast to every other client editing the same site. */
export type ChaiRealtimeSender = (event: string, payload?: any) => void | Promise<void>;

// Module-level rather than an atom: the plugin flips this from its `register()` call,
// which `registerChaiClientPlugins` runs before the builder tree renders. A reactive
// flag would leave the first paint thinking realtime is absent, and the editor would
// flash unlocked before presence resolved.
let realtimeEnabled = false;

/** Called by the realtime plugin's `register()`. Not part of the public API. */
export const enableChaiRealtime = (): void => {
  realtimeEnabled = true;
};

/** Whether the `chai:realtime` plugin is installed in this editor. */
export const isChaiRealtimeEnabled = (): boolean => realtimeEnabled;

/** @internal Resets the flag between unit tests. */
export const resetChaiRealtimeForTests = (): void => {
  realtimeEnabled = false;
};

// Boxed so jotai cannot mistake the sender for a state-updater function.
const realtimeSenderAtom = atom<{ send: ChaiRealtimeSender } | null>(null);

/**
 * Broadcasts an event to the other clients on this site. No-ops when the realtime
 * plugin is not installed, or before its channel has connected.
 */
export const useSendRealtimeEvent = (): ((event: string, payload?: any) => Promise<void>) => {
  const sender = useAtomValue(realtimeSenderAtom);
  return useCallback(
    async (event: string, payload?: any) => {
      if (!sender) return;
      await sender.send(event, payload);
    },
    [sender],
  );
};

/** Publishes the plugin's live sender to core for as long as the plugin is mounted. */
export const useRegisterChaiRealtimeSender = (send: ChaiRealtimeSender): void => {
  const setSender = useSetAtom(realtimeSenderAtom);
  useEffect(() => {
    setSender({ send });
    return () => setSender(null);
  }, [send, setSender]);
};
