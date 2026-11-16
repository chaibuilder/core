import { cache } from "react";
import { getFrameworkAdapter } from "~/server/framework-adapter";
import {
  buildCacheKey,
  buildPersistentCacheKey,
  formatCacheKeyForLog,
  formatPersistentKeyForLog,
} from "~/server/debug/debug-cache-key";
import { shouldDebug } from "~/server/debug/debug-level";
import { logCacheHit, logCacheMiss } from "~/server/debug/debug-log";
import { getInitializedState, getOptionalRequestState, runWithOptionalRequestState } from "../state";

function resolveLabel<T extends (...args: any[]) => any>(fn: T, label?: string): string {
  return label ?? (fn.name || "anonymous");
}

/**
 * 1. REQUEST-LEVEL CACHE (Memoization Only)
 *
 * Use this for instantiating Singleton classes or fetching highly dynamic data.
 * Memory is completely destroyed after the user's page finishes loading.
 */
export function withRequestCache<T extends (...args: any[]) => any>(fn: T, label?: string) {
  const cacheLabel = resolveLabel(fn, label);

  const cachedFn = cache((...args: Parameters<T>) => {
    if (shouldDebug(1)) {
      logCacheMiss("request", cacheLabel, formatCacheKeyForLog(cacheLabel, args));
    }
    return fn(...args);
  });

  return ((...args: Parameters<T>) => {
    // buildCacheKey JSON.stringify's every arg (page block arrays can be multi-MB) and
    // only feeds the debug hit/miss ledger — skip it entirely unless debug logging is on.
    if (shouldDebug(1)) {
      const key = buildCacheKey(cacheLabel, args);
      const state = getOptionalRequestState();
      const seen = state?.cacheKeys.has(key) ?? false;

      if (seen) {
        logCacheHit("request", cacheLabel, formatCacheKeyForLog(cacheLabel, args));
      }

      if (state && !seen) {
        state.cacheKeys.set(key, true);
      }
    }

    return cachedFn(...args);
  }) as T;
}

/**
 * 2. PERSISTENT-LEVEL CACHE (Global Data Cache)
 *
 * Use this for public database queries.
 * Protects the DB by sharing the result globally across all users.
 */
export function withPersistentCache<T extends (...args: any[]) => Promise<any>>(
  queryFn: T,
  keyParts: string[],
  tags: string[] = [],
  revalidate: number | false = false,
  label?: string,
) {
  const cacheLabel = resolveLabel(queryFn, label);
  const persistentKey = buildPersistentCacheKey(keyParts);
  const persistentLogKey = formatPersistentKeyForLog(keyParts);

  const instrumentedQueryFn = async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const requestState = getOptionalRequestState();
    return runWithOptionalRequestState(requestState, async () => {
      const state = getOptionalRequestState();
      if (state) {
        state.cacheKeys.set(`persistent:${persistentKey}`, true);
      }
      if (shouldDebug(1)) {
        logCacheMiss("persistent", cacheLabel, persistentLogKey);
      }
      return queryFn(...args);
    });
  };

  const globallyCachedFn = getFrameworkAdapter().persistentCache(instrumentedQueryFn, keyParts, {
    revalidate,
    tags,
  });

  return cache(async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const pendingKey = `persistent-pending:${persistentKey}`;
    const requestState = getOptionalRequestState();
    if (requestState) {
      requestState.cacheKeys.delete(`persistent:${persistentKey}`);
      requestState.cacheKeys.set(pendingKey, true);
    }

    const result = await runWithOptionalRequestState(requestState, () => globallyCachedFn(...args));

    if (
      shouldDebug(1) &&
      requestState?.cacheKeys.has(pendingKey) &&
      !requestState.cacheKeys.has(`persistent:${persistentKey}`)
    ) {
      logCacheHit("persistent", cacheLabel, persistentLogKey);
    }
    requestState?.cacheKeys.delete(pendingKey);

    return result;
  });
}

/**
 * 3. STRATEGY-BASED CACHE (Unified Cache Layer)
 *
 * Use this for APIs that need different caching strategies based on context.
 * - Draft mode: memory cache (fresh data, no persistence)
 * - Production: persistent cache (shared across users, CDN-friendly)
 *
 * Strategy is auto-detected from state.draftMode - no need to pass it manually.
 */
export function withChaiCache<T extends (...args: any[]) => Promise<any>>(
  queryFn: T,
  keyParts?: string[],
  tags?: string[],
  revalidate: number | false = false,
  label?: string,
) {
  const state = getInitializedState();
  const strategy = state.draftMode ? "memory" : "persistent";

  if (strategy === "memory") {
    return withRequestCache(queryFn, label);
  }

  if (!keyParts) {
    throw new Error("keyParts required for persistent cache strategy");
  }

  return withPersistentCache(queryFn, keyParts, tags, revalidate, label);
}
