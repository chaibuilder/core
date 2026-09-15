import type { ChaiPageType } from "~/types/actions";
import type { CollectionConfig } from "~/types/collection-config";
import type { ChaiPageProps } from "~/types/common";
import type { ChaiTrashableEntity } from "~/types/trash";

/**
 * Minimal request shape for route handlers and `resolveRequestContext`.
 * Structural type compatible with Next.js `NextRequest` and standard `Request`.
 */
export type ChaiIncomingRequest = {
  headers: { get(name: string): string | null };
  method: string;
  url: string;
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

/**
 * Everything ChaiBuilder needs to know about the current request, in one envelope:
 *
 * - **WHERE** — `appId` (tenant), `siteUrl`
 * - **WHO**   — `userId`, `role`, `permissions`, `delegatedPermissions`
 * - **HOW**   — `draft`, `lang`
 *
 * Produced by the resolver passed to `createChaiBuilder(config, { context })` (see
 * {@link ChaiContextResolver}). Every field is optional except `appId`: omit one and
 * ChaiBuilder falls back to its documented default, so a resolver only states what
 * the host actually owns.
 */
export type ChaiRequestContext = {
  /**
   * WHERE: tenant/site id. Scopes every query and cache key.
   * Defaults to `CHAIBUILDER_API_KEY ?? CHAIBUILDER_APP_KEY` from the environment —
   * return it explicitly when the id is per-request (multi-tenancy by hostname, header, user…).
   */
  appId: string;
  /**
   * WHO: authenticated user id, or `null` for anonymous visitors.
   * Authenticated actions fail without it. Resolve it from whatever auth the host uses.
   */
  userId?: string | null;
  /**
   * WHO: role label reported alongside {@link permissions} (e.g. to the builder UI).
   * Only meaningful when `permissions` is provided. Defaults to `"custom"`.
   */
  role?: string | null;
  /**
   * WHO: what this user may do — `entity:operation` keys, with `*` and `entity:*`
   * wildcards allowed (e.g. `["pages:*", "assets:read"]`).
   *
   * This is the authorization decision, and the resolver is the only place it is made.
   * Nothing else is consulted: an action cannot widen or narrow it.
   *
   * - A list → these are the user's grants. `[]` means authenticated with none.
   * - `undefined` / `null` → not a member of this app. Authenticated actions fail 401.
   *
   * Use `resolveChaiAppUserAccess({ appId, userId })` to get ChaiBuilder's own answer from
   * the `app_users` table (role expanded into permissions), or compute it however the host
   * models access.
   */
  permissions?: string[] | null;
  /**
   * WHO (delegation): the ceiling for *this credential*, independent of the user's own
   * grants. Effective permissions become `permissions ∩ delegatedPermissions`
   * (wildcard-aware). Use for OAuth apps, MCP tokens, and scoped API keys acting on a
   * user's behalf: an admin's token limited to `["pages:read"]` may only read pages.
   *
   * Omitted/`null` → no clamp (full user permissions). `[]` → nothing is permitted.
   */
  delegatedPermissions?: string[] | null;
  /**
   * @deprecated Renamed to {@link delegatedPermissions}. Still accepted: when
   * `delegatedPermissions` is absent this value is used and both fields are populated.
   */
  delegatedScopes?: string[] | null;
  /**
   * HOW: read draft content (builder + preview) instead of published content. Default `false`.
   * Drives both the source tables and the cache keys, so draft and live never collide.
   */
  draft?: boolean;
  /**
   * WHERE: absolute origin of the site (`https://example.com`). Used for link
   * resolution. Falls back to `SITE_URL`, then the request's `Host` header.
   */
  siteUrl?: string | null;
  /** HOW: language for this request. Default `"en"`. Per-action `lang` in the payload still wins. */
  lang?: string;
  /**
   * Read-only view of the incoming request headers, captured during context resolution when
   * the host passes the request to `getChaiBuilder(config, routeProps, request)`. Lets plugins
   * read client hints through `getChaiRequestHeader()`. Host resolvers never set it; absent
   * outside HTTP (scripts, MCP tools). Not serialisable — never persist or log the context
   * wholesale.
   */
  requestHeaders?: { get(name: string): string | null } | null;
};

/**
 * Arguments passed to the {@link ChaiContextResolver}.
 * `request` is present in route handlers; absent in server components, server
 * actions, MCP tools, and scripts (resolve identity from headers/cookies/args).
 */
export type ChaiContextResolverArgs<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = {
  request?: Req;
  routeProps?: ChaiBuilderRouteProps;
};

/**
 * Answers "who is asking, for which site, in what mode?" — see {@link ChaiRequestContext}.
 * Runs once per request; return only the fields the host owns.
 *
 * Passed to `createChaiBuilder(config, { context })`. It lives outside the server config
 * on purpose: auth, tenancy, and site URL are host concerns that may need framework APIs
 * (`next/headers`, a session library), while the config must stay environment-agnostic so
 * scripts, CLIs, and CI can import it.
 */
export type ChaiContextResolver<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = (
  args: ChaiContextResolverArgs<Req>,
) => Partial<ChaiRequestContext> | Promise<Partial<ChaiRequestContext>>;

/**
 * @deprecated Context passed to the removed `resolveSiteUrl` config option.
 * Resolve `siteUrl` inside your {@link ChaiContextResolver} instead.
 */
export type ChaiResolveSiteUrlContext = {
  appId: string;
};

/** @deprecated Use {@link ChaiContextResolverArgs}. */
export type ChaiRequestContextArgs<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = {
  routeProps: ChaiBuilderRouteProps;
  request?: Req;
};

/** @deprecated Use {@link ChaiContextResolver}. */
export type ChaiRequestContextResolver<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = (
  args: ChaiRequestContextArgs<Req>,
) => Partial<ChaiRequestContext> | Promise<Partial<ChaiRequestContext>>;

/**
 * Same shape as Next.js App Router route component props (`page` / `layout` / `generateMetadata`).
 * `params` / `searchParams` may be `Promise`s (Next 15+) or plain objects.
 *
 * Route Handlers (`route.ts`): pass `params` / `searchParams` from the handler context plus optional
 * `ChaiIncomingRequest` (e.g. Next.js `NextRequest`) as the third argument to `getChaiBuilder`.
 */
export type ChaiBuilderRouteProps = {
  params?: Promise<unknown> | unknown;
  searchParams?: Promise<unknown> | unknown;
};

/**
 * Global data provider function - returns merged global data object
 */
export type ChaiGlobalDataProvider<T = any> = (ctx: { lang: string; draft: boolean; inBuilder: boolean }) => Promise<T>;

export type ChaiPageNotFoundArgs = {
  /** The unresolved path, e.g. `/pricing/old`. */
  slug: string;
  appId: string;
  lang: string;
  draft: boolean;
};

/**
 * What to do with a path that matched neither a page nor a stored redirect.
 * Return a redirect, or `notFound` / nothing to let the 404 stand.
 */
export type ChaiPageNotFoundResult =
  | { redirect: string; permanent?: boolean }
  | { notFound: true }
  | null
  | undefined
  | void;

/**
 * Last say over an unresolved path, for logic the redirects table cannot express -
 * legacy URL patterns, a lookup in another system, a catch-all landing page.
 *
 * Runs only after both the page lookup and the redirects table have missed, so it can never
 * shadow a live page or a stored redirect. Throwing is treated as "no opinion" (a plain 404).
 */
export type ChaiPageNotFoundHandler = (
  args: ChaiPageNotFoundArgs,
) => ChaiPageNotFoundResult | Promise<ChaiPageNotFoundResult>;

/**
 * One dynamic template competing to own a URL. The SDK surfaces just the fields
 * a tie-break needs from its resolved routing rows.
 */
export type ChaiDynamicTemplateCandidate = {
  /** The template's base slug, e.g. `/auto-usage`. */
  slug: string;
  /** The template's page type, e.g. `vdp_page`. Null for untyped rows. */
  pageType: string | null;
};

/**
 * Arbitrates when several dynamic templates authored on the same base slug all
 * match one URL — e.g. `vdp_page` and a legacy SEO listing both hanging off
 * `/auto-usage`. The SDK otherwise resolves in page-type registration order;
 * this lets the host decide with data the URL shape cannot express (a lookup, a
 * membership set).
 *
 * `candidates` arrive in the SDK's default priority order, so `candidates[0]` is
 * what registration order would pick. Return one of the passed candidates to
 * override, or `undefined`/throw to keep the default. A return value not present
 * in `candidates` is ignored (treated as no opinion), so the resolver can never
 * be steered to an unrelated page.
 *
 * May be sync or async (mirrors {@link ChaiPageNotFoundHandler}) — a purely
 * in-memory arbitration need not be a Promise.
 */
export type ChaiDynamicTemplateTieHandler = <T extends ChaiDynamicTemplateCandidate>(
  candidates: T[],
  slug: string,
) => T | undefined | Promise<T | undefined>;

/**
 * Page type entry (includes both page types and partials)
 */
export type ChaiPageTypeEntry = ChaiPageType & {
  partial?: boolean;
};

/**
 * Collection entry
 * @deprecated Use `ChaiRepeaterDataEntry` instead.
 */
export type ChaiCollectionEntry = CollectionConfig<any>;

export type { ChaiRepeaterDataEntry } from "~/types/repeater-data";

/**
 * Page type data provider function. Follows the provider `$cacheTags`
 * convention: tags returned under `$cacheTags` are registered on the consuming
 * route during live render only (never in the builder, never in draft) and are
 * always stripped from the page data. Tags must be tenant-scoped.
 *
 * A dynamic template matches a URL by its segment pattern alone, so the item
 * behind that URL may not exist. Return `$notFound: true` to say so: the live
 * route then 404s instead of rendering the template with unresolved bindings
 * (an empty page under a 200). Like `$cacheTags` the key is always stripped
 * from the page data, and it is ignored in the builder, where the template
 * must stay editable with no item selected.
 *
 * The not-found answer is a separate branch of the result union rather than an
 * optional key on `T`: a provider typed `ChaiPageTypeDataProvider<{ doc: Doc }>`
 * has no `doc` to return when there is no item, so intersecting the two would
 * force every such provider to either widen `T` or cast.
 */
export type ChaiPageTypeNotFound = { $notFound: true; $cacheTags?: string[] };

export type ChaiPageTypeDataProvider<T = Record<string, any>> = (ctx: {
  lang: string;
  draft: boolean;
  inBuilder: boolean;
  pageProps: ChaiPageProps;
}) => Promise<(T & { $cacheTags?: string[]; $notFound?: false }) | ChaiPageTypeNotFound>;

/**
 * Block data provider function
 */
export type ChaiBlockDataProvider = (ctx: {
  block: any;
  lang: string;
  draft: boolean;
  inBuilder: boolean;
  pageProps: any;
}) => Promise<any>;

/**
 * Trash entry
 */
export type ChaiTrashEntry = ChaiTrashableEntity;

/** 0 = off (default), 1 = DB + HTTP + cache + AI summary, 2 = + API/action timing + full SQL + AI verbose (prompts, tools, tokens) */
export type ChaiDebugLevel = 0 | 1 | 2;

export type {
  ChaiBuilderServerConfigInput,
  ChaiDbConfigInput,
  ChaiDbSetup,
  ResolvedChaiAIGlobalConfig,
  ResolvedChaiBuilderServerConfig,
  ResolvedChaiDbConfig,
} from "~/types/server-config";

export type { ChaiBuilderInstance } from "~/types/chaibuilder-instance";

export type ChaiBaseSlugEntry = {
  slug: string;
  lang: string;
  pageId: string;
  primaryPageId: string | null;
  dynamicSlugCustom: string | null;
};
