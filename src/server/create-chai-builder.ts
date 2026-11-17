import { registerChaiContextResolver } from "~/server/chai-context-resolver";
import { getChaiBuilder } from "~/server/get-chaibuilder";
import type {
  ChaiBuilderInstance,
  ChaiBuilderRouteProps,
  ChaiContextResolver,
  ChaiIncomingRequest,
} from "~/types/chaibuilder-config";
import type { ResolvedChaiBuilderServerConfig } from "~/types/server-config";

export type CreateChaiBuilderOptions<Req extends ChaiIncomingRequest = ChaiIncomingRequest> = {
  /**
   * Answers "who is asking, for which site, in what mode?" once per request — returns a
   * `ChaiRequestContext`. Registered process-wide when the handle is created.
   *
   * Omit it only where there is no request to speak of (seed scripts, CLIs); ChaiBuilder
   * then falls back to a static context read from the environment.
   */
  context?: ChaiContextResolver<Req>;
};

export type ChaiBuilderHandle<TExtra extends Record<string, unknown> = Record<never, never>> = {
  /**
   * Request-scoped ChaiBuilder, bound to this config and context resolver.
   *
   * Same as the `getChaiBuilder` exported by the package, minus the `config` argument — this
   * one already has it. Import this one from your own `chaibuilder.server.ts`.
   *
   * - `getChaiBuilder(props, request)` — route handlers (`route.ts`); the resolver receives the request.
   * - `getChaiBuilder(props)` — pages, layouts, `generateMetadata`; the resolver reads cookies/headers itself.
   * - `getChaiBuilder()` — server actions, sitemaps, scripts; reuses the context already resolved
   *   for this request.
   */
  getChaiBuilder: (
    routeProps?: ChaiBuilderRouteProps,
    request?: ChaiIncomingRequest,
  ) => Promise<ChaiBuilderInstance<TExtra>>;
  /** The config this handle is bound to. */
  config: Readonly<ResolvedChaiBuilderServerConfig & TExtra>;
};

/**
 * Binds a ChaiBuilder config to a {@link ChaiContextResolver} and returns the handle every
 * server entry point uses.
 *
 * Create it once, in one module (`chaibuilder.server.ts` by convention), and import
 * `getChaiBuilder` from there — a real import, so the resolver cannot be left unregistered by
 * accident. It is the same call you already write, with the config baked in:
 *
 * ```ts
 * // chaibuilder.server.ts
 * export const { getChaiBuilder } = createChaiBuilder(config, {
 *   context: async ({ request }) => ({
 *     appId: process.env.CHAIBUILDER_APP_KEY!,
 *     userId: await currentUserId(request),
 *     draft: (await draftMode()).isEnabled,
 *   }),
 * });
 *
 * // route.ts / page.tsx — import from "@/chaibuilder.server", not the package
 * const cb = await getChaiBuilder(props, request);
 * ```
 *
 * This is why the resolver lives here and not in the config: the config stays plain data that
 * scripts, CI, and the Payload CLI can import, while this module owns the framework coupling.
 *
 * Calling it again replaces the registered resolver (last one wins) — dev-server hot reloads
 * re-evaluate the module and simply re-register an equivalent resolver.
 */
export function createChaiBuilder<
  TExtra extends Record<string, unknown> = Record<never, never>,
  Req extends ChaiIncomingRequest = ChaiIncomingRequest,
>(
  config: ResolvedChaiBuilderServerConfig & TExtra,
  options?: CreateChaiBuilderOptions<Req>,
): ChaiBuilderHandle<TExtra> {
  if (options?.context) {
    registerChaiContextResolver(options.context as ChaiContextResolver);
  }

  return {
    config,
    // The property shares its name with the imported package function; the body still calls
    // the import (object keys create no binding), passing the config this handle closed over.
    getChaiBuilder: (routeProps?: ChaiBuilderRouteProps, request?: ChaiIncomingRequest) =>
      // With neither argument, route props must stay absent (rather than passed as
      // `undefined`) so the context already resolved for this request is reused instead of
      // re-resolved. Otherwise forward both, letting `getChaiBuilder` reject a request that
      // arrives without route props.
      routeProps === undefined && request === undefined
        ? getChaiBuilder<TExtra>(config)
        : getChaiBuilder<TExtra>(config, routeProps as ChaiBuilderRouteProps, request),
  };
}
