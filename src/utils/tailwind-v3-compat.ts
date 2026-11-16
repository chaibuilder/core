/**
 * v3 semantics a JS theme cannot express, appended to every SDK Tailwind compile and the canvas:
 * - a bare `ring` defaults to v3's blue-500/50 instead of `currentColor`;
 * - `outline-none` is v3's `outline: 2px solid transparent; outline-offset: 2px` (still visible in
 *   forced-colors mode, and a later `focus:outline-*` color shows) instead of `outline-style: none`.
 *   `@utility` cannot replace a core utility, both are emitted: the first block sorts before core
 *   (it has ordered properties), the second after it (none, and registered later), so it turns
 *   core's `outline-style: none` back to solid.
 */
export const V3_COMPAT_CSS = `@theme { --default-ring-color: rgb(59 130 246 / 0.5); }
@utility outline-none { outline: 2px solid transparent; outline-offset: 2px; }
@utility outline-none { --tw-outline-style: solid; outline-style: solid; }`;
