import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { getChaiDb } from "~/server/chai-actions/db";
import { resetChaiContextResolverForTests, registerChaiContextResolver } from "~/server/chai-context-resolver";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { getOptionalRequestState } from "~/server/chai-builder/state";
import { registerChaiInstanceApi, resetChaiInstanceApisForTests } from "~/server/plugin-api/instance-api-registry";
import { getChaiBuilder, resetChaiBuilderCoreForTests } from "~/server/get-chaibuilder";
import { resetSharedChaiRequestContextForTests } from "~/server/resolve-chai-context";
import { stubChaiDbConfig } from "~/tests/setup/stub-chai-db";
import { ChaiBuilderRouteProps, ChaiPageTypeEntry } from "~/types/chaibuilder-config";

describe("getChaiBuilder", () => {
  beforeEach(() => {
    resetChaiBuilderCoreForTests();
    resetSharedChaiRequestContextForTests();
    resetChaiContextResolverForTests();
    resetActiveChaiBuilderConfigForTests();
    vi.stubEnv("CHAIBUILDER_API_KEY", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a request-scoped instance with config and default context", async () => {
    const config = buildChaiBuilderConfig({ debugLevel: 1, db: stubChaiDbConfig() });
    const cb = await getChaiBuilder(config);

    expect(cb.config).toBe(config);
    expect(cb.context).toEqual({
      appId: "test-app-id",
      siteUrl: null,
      draft: false,
      userId: null,
      lang: "en",
    });
    expect(Object.isFrozen(cb.context)).toBe(true);
    expect(typeof cb.getPage).toBe("function");
    expect(typeof cb.runAction).toBe("function");
    expect(cb.db).toBe(getChaiDb());
    expect(typeof cb.safeQuery).toBe("function");

    const result = await cb.safeQuery(async ({ db, schema }) => {
      expect(db).toBe(getChaiDb());
      expect(schema).toBe(cb.schema);
      return "ok";
    });
    expect(result).toEqual({ data: "ok", error: null });
  });

  it("exposes plugin instance namespaces, context-bound, with core keys winning on collision", async () => {
    registerChaiInstanceApi("widgets", {
      whoAmI: () => getOptionalRequestState()?.appId ?? "no-context",
    });
    // A namespace colliding with a core instance key must not clobber it.
    registerChaiInstanceApi("getPage", { bogus: () => "clobbered" });
    try {
      const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
      const cb = await getChaiBuilder(config);

      // Bound into the request context: the state the wrapper sets up is visible.
      expect((cb as any).widgets.whoAmI()).toBe("test-app-id");
      expect(typeof cb.getPage).toBe("function");
      expect((cb.getPage as any).bogus).toBeUndefined();
    } finally {
      resetChaiInstanceApisForTests();
    }
  });

  it("accepts the options object overload", async () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
    const cb = await getChaiBuilder({ config });

    expect(cb.config).toBe(config);
    expect(cb.context.appId).toBe("test-app-id");
  });

  it("reflects draft resolved by the registered resolver", async () => {
    registerChaiContextResolver(async () => ({ draft: true }));

    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
    const cb = await getChaiBuilder(config);

    expect(cb.context.draft).toBe(true);
  });

  it("uses the static default (no resolver) without touching next/headers", async () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
    const cb = await getChaiBuilder(config);

    expect(cb.context.draft).toBe(false);
    expect(cb.context.userId).toBeNull();
  });

  it("exposes configured page types from active config", async () => {
    const config = buildChaiBuilderConfig({
      db: stubChaiDbConfig(),
      pageTypes: [{ key: "product", name: "Product" }],
    });
    const cb = await getChaiBuilder(config);

    expect(cb.getPageType("product") as ChaiPageTypeEntry).toMatchObject({ key: "product", name: "Product" });
    expect(cb.getPageTypes().map((pageType: ChaiPageTypeEntry) => pageType.key)).toContain("product");
  });

  it("throws when route props are passed without a registered resolver", async () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });

    await expect(getChaiBuilder(config, { params: { slug: "home" } })).rejects.toThrow(
      "route props require a context resolver",
    );
  });

  it("throws when request is passed without route props", async () => {
    registerChaiContextResolver(async () => ({ userId: "user-1" }));
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
    const request = new Request("https://example.com") as Request & {
      cookies: { get: () => undefined };
    };
    request.cookies = { get: () => undefined };

    await expect(
      getChaiBuilder(config, undefined as unknown as ChaiBuilderRouteProps, request as never),
    ).rejects.toThrow("when passing a request, supply route props");
  });

  it("merges the registered resolver result into the request context", async () => {
    registerChaiContextResolver(async () => ({
      userId: "user-42",
      lang: "fr",
    }));
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });

    const cb = await getChaiBuilder(config, {
      params: Promise.resolve({ slug: "about" }),
      searchParams: { preview: "1" },
    });

    expect(cb.context).toMatchObject({
      appId: "test-app-id",
      userId: "user-42",
      lang: "fr",
      draft: false,
    });
  });

  it("runs onInit once on the first getChaiBuilder call", async () => {
    const onInit = vi.fn();
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() }, { onInit });

    await getChaiBuilder(config);
    await getChaiBuilder(config);

    expect(onInit).toHaveBeenCalledTimes(1);
    expect(onInit.mock.calls[0][0]).toMatchObject({ debugLevel: config.debugLevel });
  });

  it("reuses the process core across calls", async () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });
    const first = await getChaiBuilder(config);
    const second = await getChaiBuilder(config);

    expect(first.config).toBe(second.config);
    expect(first.getPageTypes()).toEqual(second.getPageTypes());
  });

  it("shares route-resolved context with later getChaiBuilder(config) calls in the same request", async () => {
    registerChaiContextResolver(async () => ({
      appId: "hostname-resolved-app",
      siteUrl: "https://acme.example",
    }));
    const config = buildChaiBuilderConfig({ db: stubChaiDbConfig() });

    const withRoute = await getChaiBuilder(config, {
      params: Promise.resolve({ hostname: "acme.example" }),
    });
    const withoutRoute = await getChaiBuilder(config);

    expect(withRoute.context.appId).toBe("hostname-resolved-app");
    expect(withoutRoute.context).toEqual(withRoute.context);
  });
});
