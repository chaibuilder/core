import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { getRegisteredChaiContextResolver, resetChaiContextResolverForTests } from "~/server/chai-context-resolver";
import { createChaiBuilder } from "~/server/create-chai-builder";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { resetChaiBuilderCoreForTests } from "~/server/get-chaibuilder";
import { resetSharedChaiRequestContextForTests } from "~/server/resolve-chai-context";
import { stubChaiDbConfig } from "~/tests/setup/stub-chai-db";
import type { ChaiBuilderRouteProps } from "~/types/chaibuilder-config";

const makeConfig = () => buildChaiBuilderConfig({ db: stubChaiDbConfig() });

/** Minimal ChaiIncomingRequest-compatible stub. */
const makeRequest = (url = "https://acme.example/api") => {
  const request = new Request(url) as Request & { cookies: { get: () => undefined } };
  request.cookies = { get: () => undefined };
  return request as never;
};

describe("createChaiBuilder", () => {
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

  it("registers the context resolver and binds the config", async () => {
    const config = makeConfig();
    const { getChaiBuilder, config: boundConfig } = createChaiBuilder(config, {
      context: async () => ({ userId: "user-1", lang: "fr" }),
    });

    expect(boundConfig).toBe(config);
    expect(getRegisteredChaiContextResolver()).not.toBeNull();

    const cb = await getChaiBuilder();
    expect(cb.config).toBe(config);
    expect(cb.context).toMatchObject({ appId: "test-app-id", userId: "user-1", lang: "fr" });
  });

  it("passes route props and request through to the resolver", async () => {
    const context = vi.fn(async () => ({ userId: "user-1" }));
    const { getChaiBuilder } = createChaiBuilder(makeConfig(), { context });

    const routeProps: ChaiBuilderRouteProps = { params: Promise.resolve({ slug: "about" }) };
    const request = makeRequest();
    await getChaiBuilder(routeProps, request);

    expect(context).toHaveBeenCalledWith({ routeProps, request });
  });

  it("shares route-resolved context with later getChaiBuilder() calls in the same request", async () => {
    const { getChaiBuilder } = createChaiBuilder(makeConfig(), {
      context: async () => ({ appId: "hostname-resolved-app", siteUrl: "https://acme.example" }),
    });

    const withRoute = await getChaiBuilder({ params: Promise.resolve({ hostname: "acme.example" }) });
    const withoutRoute = await getChaiBuilder();

    expect(withRoute.context.appId).toBe("hostname-resolved-app");
    expect(withoutRoute.context).toEqual(withRoute.context);
  });

  it("falls back to the static env context when no resolver is supplied", async () => {
    const { getChaiBuilder } = createChaiBuilder(makeConfig());

    expect(getRegisteredChaiContextResolver()).toBeNull();
    const cb = await getChaiBuilder();
    expect(cb.context).toMatchObject({ appId: "test-app-id", userId: null, draft: false });
  });

  it("lets the newest handle win when the module is re-evaluated (dev hot reload)", async () => {
    createChaiBuilder(makeConfig(), { context: async () => ({ userId: "stale-user" }) });
    const { getChaiBuilder } = createChaiBuilder(makeConfig(), { context: async () => ({ userId: "fresh-user" }) });

    const cb = await getChaiBuilder();
    expect(cb.context.userId).toBe("fresh-user");
  });

  it("rejects a request passed without route props", async () => {
    const { getChaiBuilder } = createChaiBuilder(makeConfig(), { context: async () => ({ userId: "user-1" }) });

    await expect(getChaiBuilder(undefined, makeRequest())).rejects.toThrow(
      "when passing a request, supply route props",
    );
  });
});
