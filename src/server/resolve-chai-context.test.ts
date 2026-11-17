import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChaiContextResolverForTests, registerChaiContextResolver } from "~/server/chai-context-resolver";
import {
  resetSharedChaiRequestContextForTests,
  resolveChaiContextViaResolver,
  resolveSharedChaiContext,
} from "~/server/resolve-chai-context";

describe("resolveChaiContextViaResolver", () => {
  const request = (headers: Record<string, string>) =>
    ({
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      method: "POST",
      url: "https://example.com/api",
      cookies: { get: () => undefined },
    }) as const;

  beforeEach(() => {
    resetSharedChaiRequestContextForTests();
    resetChaiContextResolverForTests();
    vi.stubEnv("CHAIBUILDER_API_KEY", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captures the request headers accessor for plugins only when a request is present", async () => {
    registerChaiContextResolver(async () => ({ userId: "user-1" }));

    const withRequest = await resolveChaiContextViaResolver({ request: request({ "x-hint": "a, b" }) });
    expect(withRequest.requestHeaders?.get("x-hint")).toBe("a, b");
    expect(withRequest.siteUrl).toBe("https://example.com");

    const withoutRequest = await resolveChaiContextViaResolver({});
    expect(withoutRequest.requestHeaders).toBeUndefined();
  });

  it("carries host-supplied permissions and role onto the context", async () => {
    registerChaiContextResolver(async () => ({ userId: "user-1", role: "editor", permissions: ["pages:read"] }));

    const context = await resolveChaiContextViaResolver({});

    expect(context).toMatchObject({ userId: "user-1", role: "editor", permissions: ["pages:read"] });
  });

  it("accepts the deprecated delegatedScopes name and mirrors it onto delegatedPermissions", async () => {
    registerChaiContextResolver(async () => ({ delegatedScopes: ["pages:read"] }));

    const context = await resolveChaiContextViaResolver({});

    expect(context.delegatedPermissions).toEqual(["pages:read"]);
    expect(context.delegatedScopes).toEqual(["pages:read"]);
  });

  it("mirrors delegatedPermissions back onto the deprecated name", async () => {
    registerChaiContextResolver(async () => ({ delegatedPermissions: ["assets:read"] }));

    const context = await resolveChaiContextViaResolver({});

    expect(context.delegatedPermissions).toEqual(["assets:read"]);
    expect(context.delegatedScopes).toEqual(["assets:read"]);
  });

  it("prefers delegatedPermissions when both names are returned", async () => {
    registerChaiContextResolver(async () => ({
      delegatedPermissions: ["pages:read"],
      delegatedScopes: ["pages:*"],
    }));

    const context = await resolveChaiContextViaResolver({});

    expect(context.delegatedPermissions).toEqual(["pages:read"]);
    expect(context.delegatedScopes).toEqual(["pages:read"]);
  });

  it("leaves delegation unset when the resolver names neither field", async () => {
    registerChaiContextResolver(async () => ({ userId: "user-1" }));

    const context = await resolveChaiContextViaResolver({});

    expect(context.delegatedPermissions).toBeUndefined();
    expect(context.delegatedScopes).toBeUndefined();
  });
});

describe("resolveSharedChaiContext re-entrancy", () => {
  beforeEach(() => {
    resetSharedChaiRequestContextForTests();
    resetChaiContextResolverForTests();
    vi.stubEnv("CHAIBUILDER_API_KEY", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives a nested resolve the static default instead of re-running the resolver", async () => {
    // Models Payload auth: the resolver triggers a hook that calls getChaiBuilder() again.
    // Pre-guard this recursed forever (the nested call re-ran the resolver, which re-ran auth).
    let calls = 0;
    registerChaiContextResolver(async () => {
      calls++;
      if (calls > 5) throw new Error("resolver recursed");
      const nested = await resolveSharedChaiContext();
      expect(nested.userId).toBeNull();
      return { appId: "app-1", userId: "user-1" };
    });

    const context = await resolveSharedChaiContext({ params: Promise.resolve({}) } as any);

    expect(calls).toBe(1);
    expect(context).toMatchObject({ appId: "app-1", userId: "user-1" });
  });

  it("does not cache the nested static default as the shared request context", async () => {
    registerChaiContextResolver(async () => {
      await resolveSharedChaiContext();
      return { appId: "app-1", userId: "user-1" };
    });

    await resolveSharedChaiContext({ params: Promise.resolve({}) } as any);

    // A later plain call must see the real resolved context, not the nested fallback.
    const shared = await resolveSharedChaiContext();
    expect(shared).toMatchObject({ appId: "app-1", userId: "user-1" });
  });

  it("clears the guard when the resolver throws", async () => {
    registerChaiContextResolver(async () => {
      throw new Error("boom");
    });

    await expect(resolveSharedChaiContext({ params: Promise.resolve({}) } as any)).rejects.toThrow("boom");

    registerChaiContextResolver(async () => ({ appId: "app-2", userId: "user-2" }));
    const context = await resolveSharedChaiContext();
    expect(context).toMatchObject({ appId: "app-2", userId: "user-2" });
  });
});
