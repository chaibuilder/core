import type { ChaiBlock } from "~/types/common";

/**
 * Process-global registry of page version sources beyond the two core owns.
 *
 * GET_COMPARE_DATA diffs two versions of a page. Core reads the `draft` (app_pages) and `live`
 * (app_pages_online) versions itself; any other version type is stored by a plugin, which
 * registers a loader for it here. A type nobody registered is reported as invalid.
 *
 * Kept on `globalThis` like the action hooks, so the registration survives a plugin bundled in a
 * separate module graph from the action that reads it.
 */

/** One version of a page, as GET_COMPARE_DATA compares it. */
export type ChaiPageVersion = {
  /** The page the version belongs to: a version id may point at another page than the caller expects. */
  pageId: string;
  blocks: ChaiBlock[];
  seo: unknown;
  tracking: unknown;
};

/**
 * Loads version `id` of the caller's app, or `null` when there is no such version in that app.
 * Must scope the lookup by `appId`: the id arrives from the client as a caller-supplied string.
 */
export type ChaiPageVersionLoader = (args: { appId: string; id: string }) => Promise<ChaiPageVersion | null>;

const _g = globalThis as typeof globalThis & {
  __chaiPageVersionSources?: Map<string, ChaiPageVersionLoader>;
};

function getRegistry(): Map<string, ChaiPageVersionLoader> {
  if (!_g.__chaiPageVersionSources) {
    _g.__chaiPageVersionSources = new Map();
  }
  return _g.__chaiPageVersionSources;
}

/** Contributes version type `type` to GET_COMPARE_DATA. Re-registering a type replaces its loader. */
export function registerChaiPageVersionSource(type: string, loader: ChaiPageVersionLoader): void {
  getRegistry().set(type, loader);
}

/** The loader registered for `type`, if any. */
export function getChaiPageVersionSource(type: string): ChaiPageVersionLoader | undefined {
  return getRegistry().get(type);
}

/** @internal Clears registered sources between unit tests. */
export function resetChaiPageVersionSourcesForTests(): void {
  _g.__chaiPageVersionSources = undefined;
}
