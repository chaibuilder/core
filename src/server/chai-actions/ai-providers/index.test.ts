import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChaiAiProviderPlugin, ChaiBuilderServerConfigInput } from "~/types/server-config";
import { useTestChaiConfig } from "~/tests/setup/chai-config";

/** Builds the real server config with this `ai` input (restored by the harness after each test). */
const configAI = (ai: ChaiBuilderServerConfigInput["ai"]) => useTestChaiConfig({ ai });

// The SDK packages below are the network boundary, so they are the only modules replaced.
// The real `importOptionalPeer` loads them: under Vitest's `vm` the `Function`-built import is
// rejected and the helper falls back to its transformed dynamic import, which Vitest routes to
// these mocks (`import-optional-peer.test.ts` covers that fallback).

const createOpenRouter = vi.fn((opts: unknown) => ({
  __id: "openrouter",
  opts,
  languageModel: (m: string) => ({ m }),
  imageModel: (m: string) => ({ m }),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (opts: unknown) => createOpenRouter(opts),
}));

const createOpenAICompatible = vi.fn((opts: unknown) => ({
  __id: "openai-compatible",
  opts,
  languageModel: (m: string) => ({ m }),
  imageModel: (m: string) => ({ m }),
}));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (opts: unknown) => createOpenAICompatible(opts),
}));

// Workers AI returns a *callable* provider with `.imageModel` but no `.languageModel`.
const createWorkersAI = vi.fn((opts: unknown) => {
  const provider = (modelId: string) => ({ __id: "cf-language", modelId, opts });
  provider.imageModel = (modelId: string) => ({ __id: "cf-image", modelId });
  return provider;
});
vi.mock("workers-ai-provider", () => ({
  createWorkersAI: (opts: unknown) => createWorkersAI(opts),
}));

import { ensureAiProvider, resetAiProviderForTests } from "./index";

const DEFAULT_PROVIDER_KEY = "AI_SDK_DEFAULT_PROVIDER";
const g = globalThis as unknown as Record<string, unknown>;

describe("ensureAiProvider (plugin architecture)", () => {
  const clearEnv = () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_APP_NAME;
    delete process.env.OPENROUTER_APP_URL;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_NAME;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  };

  beforeEach(() => {
    createOpenRouter.mockClear();
    createOpenAICompatible.mockClear();
    createWorkersAI.mockClear();
    clearEnv();
    delete g[DEFAULT_PROVIDER_KEY];
    resetAiProviderForTests();
  });

  afterEach(() => {
    clearEnv();
    delete g[DEFAULT_PROVIDER_KEY];
    resetAiProviderForTests();
  });

  it("does nothing when no provider is configured (gateway default)", async () => {
    await ensureAiProvider();
    expect(g[DEFAULT_PROVIDER_KEY]).toBeUndefined();
    expect(createOpenRouter).not.toHaveBeenCalled();
  });

  describe("built-in OpenRouter plugin", () => {
    it("installs OpenRouter when OPENROUTER_API_KEY is set", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      await ensureAiProvider();

      expect(createOpenRouter).toHaveBeenCalledTimes(1);
      expect(createOpenRouter).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-or-test", extraBody: { usage: { include: true } } }),
      );
      expect((g[DEFAULT_PROVIDER_KEY] as { __id: string }).__id).toBe("openrouter");
    });

    it("is idempotent for an unchanged key but rebuilds when it rotates", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-one";
      await ensureAiProvider();
      await ensureAiProvider();
      expect(createOpenRouter).toHaveBeenCalledTimes(1);

      process.env.OPENROUTER_API_KEY = "sk-or-two";
      await ensureAiProvider();
      expect(createOpenRouter).toHaveBeenCalledTimes(2);
      expect(createOpenRouter).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: "sk-or-two" }));
    });

    it("names the package to install when its SDK is missing", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      createOpenRouter.mockImplementationOnce(() => {
        throw Object.assign(new Error("Cannot find package '@openrouter/ai-sdk-provider'"), {
          code: "ERR_MODULE_NOT_FOUND",
        });
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      // The builder shows this verbatim, so it has to carry the fix itself rather
      // than leaving the gateway's unrelated errors to stand in for it.
      await expect(ensureAiProvider()).rejects.toThrow(/Install `@openrouter\/ai-sdk-provider`/);
      expect(g[DEFAULT_PROVIDER_KEY]).toBeUndefined();
      spy.mockRestore();
    });

    it("removes its provider when the key is unset (gateway fallback)", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      await ensureAiProvider();
      expect(g[DEFAULT_PROVIDER_KEY]).toBeDefined();

      delete process.env.OPENROUTER_API_KEY;
      await ensureAiProvider();
      expect(g[DEFAULT_PROVIDER_KEY]).toBeUndefined();
    });
  });

  describe("built-in OpenAI-compatible plugin", () => {
    it("activates on OPENAI_COMPATIBLE_BASE_URL and passes name + apiKey", async () => {
      process.env.OPENAI_COMPATIBLE_BASE_URL = "https://router.huggingface.co/v1";
      process.env.OPENAI_COMPATIBLE_API_KEY = "hf_test";
      process.env.OPENAI_COMPATIBLE_NAME = "huggingface";

      await ensureAiProvider();

      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: "huggingface",
        baseURL: "https://router.huggingface.co/v1",
        apiKey: "hf_test",
      });
      expect((g[DEFAULT_PROVIDER_KEY] as { __id: string }).__id).toBe("openai-compatible");
    });

    it("omits apiKey for keyless endpoints and defaults the name", async () => {
      process.env.OPENAI_COMPATIBLE_BASE_URL = "http://localhost:11434/v1"; // Ollama

      await ensureAiProvider();

      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: "openai-compatible",
        baseURL: "http://localhost:11434/v1",
      });
    });

    it("yields to OpenRouter when both are configured (registry order)", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      process.env.OPENAI_COMPATIBLE_BASE_URL = "https://router.huggingface.co/v1";

      await ensureAiProvider();

      expect((g[DEFAULT_PROVIDER_KEY] as { __id: string }).__id).toBe("openrouter");
      expect(createOpenAICompatible).not.toHaveBeenCalled();
    });
  });

  describe("built-in Cloudflare Workers AI plugin", () => {
    it("activates when account id + token are set and adapts the callable provider", async () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = "acct_123";
      process.env.CLOUDFLARE_API_TOKEN = "cf_token";

      await ensureAiProvider();

      expect(createWorkersAI).toHaveBeenCalledWith({ accountId: "acct_123", apiKey: "cf_token" });
      // Installed as a ChaiAiSdkProvider adapter exposing languageModel/imageModel,
      // since Workers AI itself has no `.languageModel` for the AI SDK to call.
      const installed = g[DEFAULT_PROVIDER_KEY] as {
        languageModel: (m: string) => { __id: string };
        imageModel: (m: string) => { __id: string };
      };
      expect(typeof installed.languageModel).toBe("function");
      expect(installed.languageModel("@cf/meta/llama-3.1-8b-instruct").__id).toBe("cf-language");
      expect(installed.imageModel("@cf/black-forest-labs/flux-1-schnell").__id).toBe("cf-image");
    });

    it("does not activate with only one of the two credentials", async () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = "acct_123"; // token missing

      await ensureAiProvider();

      expect(createWorkersAI).not.toHaveBeenCalled();
      expect(g[DEFAULT_PROVIDER_KEY]).toBeUndefined();
    });
  });

  describe("explicit ai.provider", () => {
    it("uses a provider instance and overrides env plugins", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test"; // would otherwise activate OpenRouter
      const provider = { __id: "custom", languageModel: (m: string) => ({ m }) };
      configAI({ provider });

      await ensureAiProvider();

      expect(g[DEFAULT_PROVIDER_KEY]).toBe(provider);
      expect(createOpenRouter).not.toHaveBeenCalled();
    });

    it("supports an async factory and caches it", async () => {
      const provider = { __id: "factory", languageModel: (m: string) => ({ m }) };
      const factory = vi.fn(async () => provider);
      configAI({ provider: factory });

      await ensureAiProvider();
      await ensureAiProvider();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(g[DEFAULT_PROVIDER_KEY]).toBe(provider);
    });

    it("rejects instead of silently using the gateway when the configured provider throws", async () => {
      configAI({
        provider: () => {
          throw new Error("boom");
        },
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(ensureAiProvider()).rejects.toThrow(/ai\.provider/);

      expect(g[DEFAULT_PROVIDER_KEY]).toBeUndefined();
      spy.mockRestore();
    });

    it("logs an init failure once, but replays it to every call", async () => {
      configAI({
        provider: () => {
          throw new Error("boom");
        },
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(ensureAiProvider()).rejects.toThrow();
      await expect(ensureAiProvider()).rejects.toThrow();
      await expect(ensureAiProvider()).rejects.toThrow();

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it("retries after the failing provider is replaced", async () => {
      configAI({
        provider: () => {
          throw new Error("boom");
        },
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(ensureAiProvider()).rejects.toThrow();

      const provider = { __id: "fixed", languageModel: (m: string) => ({ m }) };
      configAI({ provider });

      await expect(ensureAiProvider()).resolves.toBeUndefined();
      expect(g[DEFAULT_PROVIDER_KEY]).toBe(provider);
      spy.mockRestore();
    });
  });

  describe("custom ai.providers plugins", () => {
    it("takes priority over the built-in plugins", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test"; // built-in would activate
      const customProvider = { __id: "cloudflare", languageModel: (m: string) => ({ m }) };
      const custom: ChaiAiProviderPlugin = {
        id: "cloudflare",
        isConfigured: () => true,
        createProvider: () => customProvider,
      };
      configAI({ providers: [custom] });

      await ensureAiProvider();

      expect(g[DEFAULT_PROVIDER_KEY]).toBe(customProvider);
      expect(createOpenRouter).not.toHaveBeenCalled();
    });

    it("skips plugins that are not configured and falls through to the next", async () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      const inactive: ChaiAiProviderPlugin = {
        id: "inactive",
        isConfigured: () => false,
        createProvider: () => ({ __id: "inactive", languageModel: (m: string) => ({ m }) }),
      };
      configAI({ providers: [inactive] });

      await ensureAiProvider();

      // inactive skipped -> built-in OpenRouter wins
      expect((g[DEFAULT_PROVIDER_KEY] as { __id: string }).__id).toBe("openrouter");
    });
  });

  describe("host-set globalThis provider", () => {
    it("is left intact when nothing is configured", async () => {
      const hostProvider = { __host: true };
      g[DEFAULT_PROVIDER_KEY] = hostProvider;

      await ensureAiProvider();

      expect(g[DEFAULT_PROVIDER_KEY]).toBe(hostProvider);
    });

    it("is not overridden by an active env plugin", async () => {
      const hostProvider = { __host: true };
      g[DEFAULT_PROVIDER_KEY] = hostProvider;
      process.env.OPENROUTER_API_KEY = "sk-or-test"; // would otherwise install OpenRouter

      await ensureAiProvider();

      expect(g[DEFAULT_PROVIDER_KEY]).toBe(hostProvider);
      expect(createOpenRouter).not.toHaveBeenCalled();
    });

    it("is not overridden by an explicit ai.provider", async () => {
      const hostProvider = { __host: true };
      g[DEFAULT_PROVIDER_KEY] = hostProvider;
      const configProvider = { __id: "config", languageModel: (m: string) => ({ m }) };
      configAI({ provider: configProvider });

      await ensureAiProvider();

      expect(g[DEFAULT_PROVIDER_KEY]).toBe(hostProvider);
    });
  });

  it("serializes concurrent calls without racing state (single build)", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";

    await Promise.all([ensureAiProvider(), ensureAiProvider(), ensureAiProvider()]);

    // Serialized: the first call builds, the rest hit the idempotent fast-path.
    expect(createOpenRouter).toHaveBeenCalledTimes(1);
    expect((g[DEFAULT_PROVIDER_KEY] as { __id: string }).__id).toBe("openrouter");
  });
});
