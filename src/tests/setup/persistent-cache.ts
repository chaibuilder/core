import { setFrameworkAdapter, type ChaiFrameworkAdapter } from "~/server/framework-adapter";

export type MemoryPersistentCache = {
  /** Memoised results keyed by keyParts + call args. */
  entries: Map<string, Promise<unknown>>;
  /** Every `persistentCache` wrap, in order — what a framework cache would be keyed by. */
  wraps: { keyParts: string[]; tags: string[] }[];
  /** Tags passed to `invalidateTag`. */
  invalidatedTags: string[];
  /** Paths passed to `invalidatePath`. */
  invalidatedPaths: string[];
  clear: () => void;
};

/**
 * Installs a real, Map-backed framework adapter — the in-process equivalent of Next's
 * `unstable_cache`. Published (non-draft) code paths cache through it; tests inspect what was
 * cached and invalidated. The harness resets the adapter after every test.
 */
export function installMemoryPersistentCache(extra: Partial<ChaiFrameworkAdapter> = {}): MemoryPersistentCache {
  const cache: MemoryPersistentCache = {
    entries: new Map(),
    wraps: [],
    invalidatedTags: [],
    invalidatedPaths: [],
    clear: () => cache.entries.clear(),
  };

  const persistentCache = ((
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    opts?: { tags?: string[] },
  ) => {
    cache.wraps.push({ keyParts, tags: opts?.tags ?? [] });
    return (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      if (!cache.entries.has(key)) {
        const pending = fn(...args);
        cache.entries.set(key, pending);
        // Like `unstable_cache`, never keep a rejection: the next call must retry.
        pending.catch(() => {
          if (cache.entries.get(key) === pending) cache.entries.delete(key);
        });
      }
      return cache.entries.get(key)!;
    };
  }) as ChaiFrameworkAdapter["persistentCache"];

  setFrameworkAdapter({
    persistentCache,
    invalidateTag: (tag) => {
      cache.invalidatedTags.push(tag);
    },
    invalidatePath: (path) => {
      cache.invalidatedPaths.push(path);
    },
    ...extra,
  });
  return cache;
}
