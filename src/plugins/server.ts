/**
 * Server plugin barrel.
 *
 * The exported set is edition-specific — an edition with server plugins exports them and a
 * preset that installs the usual set, one without exports nothing — so the list lives in
 * `src/edition/server-plugins-barrel.ts` and this file only forwards it. Editions that have
 * something to export publish it as `<pkg>/plugins/server`.
 */
export * from "~/edition/server-plugins-barrel";
