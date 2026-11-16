/**
 * The `lastSaved` a save writes. `lastSaved` doubles as the ifLastSaved
 * version, and a millisecond clock can hand two saves the same value, so a
 * write that knows the version it replaces always moves it strictly past
 * that version; otherwise a client still holding it would match again and
 * overwrite this write. Also covers clock skew between instances.
 */
export function nextLastSaved(ifLastSaved?: string | null, now: number = Date.now()): string {
  // Postgres returns "YYYY-MM-DD HH:MM:SS.ffffff+00"; any sub-millisecond part
  // is truncated, so +1ms still lands strictly past it.
  const matched = typeof ifLastSaved === "string" ? Date.parse(ifLastSaved) : NaN;
  return new Date(Number.isNaN(matched) ? now : Math.max(now, matched + 1)).toISOString();
}
