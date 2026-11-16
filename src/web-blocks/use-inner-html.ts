import { cache, useMemo } from "react";

/**
 * Stable `dangerouslySetInnerHTML` value for a given HTML string.
 *
 * React 19 re-applies `dangerouslySetInnerHTML` on EVERY render when the inline
 * `{ __html }` object identity changes (`setProp` assigns `innerHTML` without comparing
 * the previous string; React 18 compared and skipped). In the builder canvas every block
 * re-renders on selection, so inline objects re-injected the whole page's markup on each
 * click (hundreds of text-node replacements, 400–600 ms mousedown handlers). Memoizing
 * the object on the string keeps identity stable while the HTML is unchanged, so React
 * leaves the DOM alone.
 *
 * Safe in shared server/client blocks: the RSC (Flight) hooks dispatcher implements
 * `useMemo` (it simply evaluates the factory).
 */
// Request-scoped on the server: identical strings (repeated icons, duplicated
// partial content) share ONE object, so the RSC flight serialises repeats as
// `$ref`s instead of copying the markup. On the client `cache` is a passthrough
// and `useMemo` alone keeps the per-instance identity stable.
const shared = cache((value: string): { __html: string } => ({ __html: value }));

export const useInnerHtml = (html: string | null | undefined): { __html: string } => {
  // Normalize BEFORE memoizing so null/undefined/"" share one identity — otherwise a
  // source flipping between null and undefined would still yield a new object.
  const value = html ?? "";
  return useMemo(() => shared(value), [value]);
};
