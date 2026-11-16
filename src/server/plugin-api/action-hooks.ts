import type { RoutingSlugUpdate } from "~/server/chai-builder/public/page-routing-cache";
import type { ChaiEditSource } from "~/server/chai-actions/utils/edit-source";

/**
 * Process-global server action hooks. Core actions announce lifecycle events
 * (e.g. `"page:slug-changed"`) and plugins subscribe without core importing
 * plugin code. Handlers are keyed per hook so repeated registration from
 * separate module graphs replaces rather than duplicates.
 *
 * Handlers may return cache tags; `runChaiActionHooks` aggregates them so the
 * firing action can include plugin-owned tags in its mutation response.
 */

/** A draft page row as an UPDATE_PAGE save left it. */
export type ChaiSavedPageSnapshot = {
  name: string | null;
  slug: string | null;
  blocks: unknown;
  pageType: string | null;
  lang: string | null;
  seo: unknown;
  tracking: unknown;
  currentEditor?: string | null;
};

/** The site-wide styling a save or publish touched. A part it left alone is absent or `undefined`. */
export type ChaiThemeSnapshot = {
  theme?: unknown;
  designTokens?: unknown;
};

export type ChaiActionHookArgs = {
  /** Live page slugs moved; old URLs 404 until whoever cares (redirects) reacts. */
  "page:slug-changed": { appId: string; slugUpdates: RoutingSlugUpdate[]; userId?: string | null };
  /** A page now owns this path (created or renamed onto it). */
  "page:path-claimed": { appId: string; slug: string };
  /**
   * UPDATE_PAGE wrote a page's draft row. Fires once per save, after the write, with the row as
   * saved and how the write reached the server (`builder`, `mcp`, …).
   */
  "page:saved": {
    appId: string;
    pageId: string;
    page: ChaiSavedPageSnapshot;
    userId?: string | null;
    source: ChaiEditSource;
  };
  /**
   * PUBLISH_CHANGES is about to replace a page's live row; the current live row is still in
   * place. `revisions` is the request's `revisions` flag: the caller asked for the outgoing live
   * version to be kept in history.
   */
  "page:publishing": { appId: string; pageId: string; revisions: boolean };
  /** DELETE_PAGE removed pages: moved them to trash, or deleted them for good when `permanent`. */
  "pages:deleted": { appId: string; pageIds: string[]; permanent: boolean };
  /** A theme or design-token save (builder, settings, AI or MCP) wrote the site's draft styling. */
  "theme:saved": { appId: string; userId?: string | null; snapshot: ChaiThemeSnapshot };
  /**
   * PUBLISH_CHANGES put the site's theme or design tokens live. `revisions` is the request's
   * `revisions` flag, as for `"page:publishing"`.
   */
  "theme:published": { appId: string; userId?: string | null; snapshot: ChaiThemeSnapshot; revisions: boolean };
};

export type ChaiActionHookName = keyof ChaiActionHookArgs;

type HookHandler<N extends ChaiActionHookName> = (
  args: ChaiActionHookArgs[N],
) => void | string[] | Promise<void | string[]>;

const _g = globalThis as typeof globalThis & {
  __chaiActionHooks?: Map<string, Map<string, HookHandler<any>>>;
};

function getRegistry(): Map<string, Map<string, HookHandler<any>>> {
  if (!_g.__chaiActionHooks) {
    _g.__chaiActionHooks = new Map();
  }
  return _g.__chaiActionHooks;
}

export function registerChaiActionHook<N extends ChaiActionHookName>(
  hook: N,
  key: string,
  handler: HookHandler<N>,
): void {
  const registry = getRegistry();
  if (!registry.has(hook)) {
    registry.set(hook, new Map());
  }
  registry.get(hook)!.set(key, handler);
}

/**
 * Runs all handlers for a hook and returns their aggregated cache tags.
 * A failing handler is logged and skipped — hook work must never block the
 * action that fired it.
 */
export async function runChaiActionHooks<N extends ChaiActionHookName>(
  hook: N,
  args: ChaiActionHookArgs[N],
): Promise<string[]> {
  const handlers = getRegistry().get(hook);
  if (!handlers) return [];
  const tags: string[] = [];
  for (const [key, handler] of handlers) {
    try {
      const result = await handler(args);
      if (Array.isArray(result)) {
        tags.push(...result);
      }
    } catch (error) {
      console.error(`ChaiBuilder: action hook "${hook}" handler "${key}" failed:`, error);
    }
  }
  return tags;
}

/** @internal Clears registered hooks between unit tests. */
export function resetChaiActionHooksForTests(): void {
  _g.__chaiActionHooks = undefined;
}
