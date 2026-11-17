import { describe, expect, it } from "vitest";
import { defineChaiServerPlugin, setPluginFeatures, setPluginMediaManager } from "~/server/plugin-api";
import { DEFAULT_CHAI_BUILDER_SERVER_CONFIG, resolveChaiBuilderConfig } from "./index";
import { stubChaiDbSetup } from "~/tests/setup/stub-chai-db";

/**
 * Stand-in plugin keys. Real plugins declare their own via the same module augmentation;
 * these exist only so this file can exercise the resolve pipeline without depending on any
 * particular plugin being present.
 */
declare module "~/types/server-config" {
  interface ChaiPluginFeatures {
    testNestedFlag?: { enabled: boolean; drafts: boolean; maxRevisions: number };
  }
  interface ChaiPluginMediaManagerConfig {
    testImageSearch?: { enabled: boolean; providers: Array<{ id: string; filters: Record<string, unknown> }> };
  }
}

/**
 * Stand-in for a plugin that owns a nested feature flag.
 * Registered = the plugin's value is final; options carry the config.
 */
const nestedFlagPlugin = (value: { enabled: boolean; drafts: boolean; maxRevisions: number }) =>
  defineChaiServerPlugin((config) => setPluginFeatures(config, { testNestedFlag: value }));

describe("resolveChaiBuilderConfig", () => {
  it("includes builtin page types, trash entities, and AI defaults", () => {
    const db = stubChaiDbSetup();
    const config = resolveChaiBuilderConfig({ db });

    // The _layout partial type is plugin-owned.
    expect(config.pageTypes.map((p) => p.key)).toEqual(["page", "global", "_folder"]);
    // Trash entities are plugin-owned; the bare core has none.
    expect(config.trash).toEqual([]);
    expect(config.ai.logging.logger).toBe(DEFAULT_CHAI_BUILDER_SERVER_CONFIG.ai.logging.logger);
    expect(config.ai.models.length).toBeGreaterThan(0);
    expect(config.debugLevel).toBe(0);
    expect(config.db).toBe(db);
  });

  it("merges additional page types by key", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      pageTypes: [
        {
          key: "product",
          name: "Product",
        },
      ],
    });

    expect(config.pageTypes.map((p) => p.key)).toEqual(["page", "global", "_folder", "product"]);
  });

  it("overrides builtin page type fields on key collision", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      pageTypes: [
        {
          key: "page",
          name: "Custom Page",
        },
      ],
    });

    const pageType = config.pageTypes.find((p) => p.key === "page");
    expect(pageType?.name).toBe("Custom Page");
    expect(pageType?.hasSlug).toBe(true);
  });

  it("deep merges partial ai overrides while keeping defaults", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      // Deliberately partial nested override; deepMerge fills the rest from defaults.
      ai: { logging: { clientId: "client-1" } },
    });

    expect(config.ai.logging.clientId).toBe("client-1");
    expect(config.ai.logging.logger).toBe(DEFAULT_CHAI_BUILDER_SERVER_CONFIG.ai.logging.logger);
  });

  it("applies scalar overrides", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      debugLevel: 2,
    });

    expect(config.debugLevel).toBe(2);
  });

  it("merges block data providers by block type", () => {
    const heroProvider = async (_ctx: any) => ({ title: "Hero" });
    const cardProvider = async (_ctx: any) => ({ count: 1 });

    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      blockDataProviders: {
        Hero: heroProvider,
        Card: cardProvider,
      },
    });

    expect(config.blockDataProviders.Hero).toBe(heroProvider);
    expect(config.blockDataProviders.Card).toBe(cardProvider);
  });

  it("merges action overrides into resolved config", () => {
    const customAction = { name: "custom", execute: () => ({ ok: true }) };

    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      actions: {
        custom: customAction as any,
      },
    });

    expect(config.actions.custom).toBe(customAction);
    expect(config.builderActions.custom).toBe(customAction);
  });

  it("lets `actions` win over the deprecated `builderActions` on a name clash", () => {
    const current = { name: "current", execute: () => ({ ok: true }) };
    const legacy = { name: "legacy", execute: () => ({ ok: true }) };
    const legacyOnly = { name: "legacyOnly", execute: () => ({ ok: true }) };

    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      actions: { CUSTOM: current as any },
      builderActions: { CUSTOM: legacy as any, LEGACY_ONLY: legacyOnly as any },
    });

    expect(config.actions.CUSTOM).toBe(current);
    expect(config.actions.LEGACY_ONLY).toBe(legacyOnly);
  });

  it("derives feature flags from bare db config", () => {
    const config = resolveChaiBuilderConfig({ db: stubChaiDbSetup() });

    // No trash entities without the trash plugin, so the feature derives to off.
    expect(config.features.trash).toBe(false);
    expect(config.features.ai).toBe(true);
  });

  it("leaves plugin-owned feature keys absent when their plugin is not registered", () => {
    const config = resolveChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect(config.features.testNestedFlag).toBeUndefined();
  });

  it("sets a plugin-owned feature key once the plugin is registered", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [nestedFlagPlugin({ enabled: true, drafts: false, maxRevisions: 20 })],
    });

    expect(config.features.testNestedFlag).toEqual({ enabled: true, drafts: false, maxRevisions: 20 });
  });

  it("lets the plugin win over an untyped app value for its own key", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [nestedFlagPlugin({ enabled: true, drafts: false, maxRevisions: 20 })],
      // Plugin-owned keys are excluded from the input type; simulate a stale app
      // config sneaking one in — the plugin's value must win.
      features: { testNestedFlag: { enabled: false, drafts: true, maxRevisions: 5 } } as never,
    });

    expect(config.features.testNestedFlag).toEqual({ enabled: true, drafts: false, maxRevisions: 20 });
  });

  it("applies explicit feature overrides", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      features: { darkMode: true, trash: false },
    });

    expect(config.features.darkMode).toBe(true);
    expect(config.features.trash).toBe(false);
  });

  it("defaults the editor UI features when none are passed", () => {
    const config = resolveChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect(config.features.copyPaste).toBe(true);
    expect(config.features.dragAndDrop).toBe(true);
    expect(config.features.dataBinding).toBe(true);
    expect(config.features.importHtml).toBe(true);
    expect(config.features.importTheme).toBe(true);
    expect(config.features.validateStructure).toBe(true);
    expect(config.features.designTokens).toBe(true);
    expect(config.features.pagesManager).toBe(true);
    expect(config.features.darkMode).toBe(false);
    expect(config.features.gotoSettings).toBe(false);
    expect(config.features.resetSeoToDefault).toBe(false);
    expect(config.features.chaiBranding).toBe(false);
    expect(config.features.upstreamPages).toBe(false);
  });

  it("applies editor UI feature overrides in both directions", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      features: { darkMode: true, dragAndDrop: false, chaiBranding: true },
    });

    expect(config.features.darkMode).toBe(true);
    expect(config.features.dragAndDrop).toBe(false);
    expect(config.features.chaiBranding).toBe(true);
    expect(config.features.copyPaste).toBe(true);
  });

  it("treats an explicitly undefined feature as unset rather than off", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      features: { copyPaste: undefined, dragAndDrop: false },
    });

    expect(config.features.copyPaste).toBe(true);
    expect(config.features.dragAndDrop).toBe(false);
  });

  it("replaces the builtin AI models rather than merging them", () => {
    const models = [{ id: "zai/glm-5.2", name: "GLM 5.2", provider: "zai", description: "3x", multiplier: 3 }];
    const config = resolveChaiBuilderConfig({ db: stubChaiDbSetup(), ai: { models } });

    expect(config.features.ai).toBe(true);
    expect(config.ai.models).toEqual(models);
  });

  it("leaves the media manager empty without the plugins that own its tabs", () => {
    const config = resolveChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect(config.ai.actionModels).toEqual({});
    expect(config.mediaManager).toEqual({});
  });

  it("carries plugin-set media manager config into the resolved config", () => {
    const providers = [{ id: "pexels", filters: { orientation: ["default", "landscape"] } }];
    const mediaPlugin = defineChaiServerPlugin((config) =>
      setPluginMediaManager(config, { testImageSearch: { enabled: true, providers } }),
    );
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [mediaPlugin],
    });

    expect(config.mediaManager.testImageSearch?.enabled).toBe(true);
    expect(config.mediaManager.testImageSearch?.providers).toEqual(providers);
  });

  it("derives ai false when models array is empty", () => {
    const config = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      ai: { models: [] },
    });

    expect(config.features.ai).toBe(false);
  });
});
