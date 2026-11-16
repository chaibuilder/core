import type { ChaiAiPageEditLease } from "./chai-realtime-state";

/** Whether a lease read earlier is still unexpired (leases are polled, so one can lapse between checks). */
export const isChaiAiPageEditActive = (
  lease: Pick<ChaiAiPageEditLease, "expiresAt"> | null | undefined,
  now: number = Date.now(),
): lease is ChaiAiPageEditLease => {
  const expires = lease ? Date.parse(lease.expiresAt) : Number.NaN;
  return Number.isFinite(expires) && expires > now;
};

/**
 * "just now", "4 min ago", "2 h 5 min ago" — elapsed time since an ISO timestamp.
 * Future timestamps (clock skew between host and browser) read as "just now".
 */
export const formatSince = (iso: string | undefined, now: number = Date.now()): string => {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min ago` : `${hours} h ago`;
};

/** Local wall-clock time of an ISO timestamp ("2:32 PM"), or "" when it does not parse. */
export const formatClockTime = (iso: string | undefined, locale: string = "en-US"): string => {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(then)) return "";
  return new Date(then).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
};
