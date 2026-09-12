import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRegisteredChaiBlock } from "~/registry/v2/runtime/core";
import { buildChaiBuilderConfig, getChaiBuilderConfigOnInit } from "~/server/build-config";
import { getChaiAction } from "~/server/chai-actions/actions-registery";
import { getDb, resetDbForTests } from "~/server/chai-actions/db";
import { ChaiBaseAction } from "~/server/chai-actions/export";
import { resolveChaiBuilderConfig } from "~/server/defaults";
import { BUILTIN_CHAI_ACTIONS } from "~/server/defaults/builtin-chai-actions";
import {
  getActiveChaiBuilderConfig,
  getConfigBuilderAction,
  resetActiveChaiBuilderConfigForTests,
} from "~/server/defaults/config-registry";
import { stubChaiDbSetup } from "~/tests/setup/stub-chai-db";

describe("buildChaiBuilderConfig", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
  });

  it("returns a frozen resolved config with SDK defaults", () => {
    const config = buildChaiBuilderConfig({ debugLevel: 2, db: stubChaiDbSetup() });

    expect(Object.isFrozen(config)).toBe(true);
    expect(config.debugLevel).toBe(2);
    expect(config.pageTypes.map((pageType) => pageType.key)).toEqual(["page", "global", "_folder"]);
  });

  it("initializes Chai db singleton from config", () => {
    const setup = stubChaiDbSetup();
    resetDbForTests();
    buildChaiBuilderConfig({ db: setup });
    expect(getDb()).toBe(setup.drizzle);
  });

  it("requires db in resolve step", () => {
    expect(() => resolveChaiBuilderConfig({} as any)).toThrow(/`db` is required/);
  });

  it("sets the active config registry", () => {
    const config = buildChaiBuilderConfig({
      debugLevel: 1,
      db: stubChaiDbSetup(),
    });

    expect(getActiveChaiBuilderConfig()).toBe(config);
  });

  it("includes builtin chai actions in the resolved config", () => {
    buildChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect(getConfigBuilderAction("CREATE_PAGE")).toBe(BUILTIN_CHAI_ACTIONS.CREATE_PAGE);
    expect(getChaiAction("DELETE_PAGE")).toBe(BUILTIN_CHAI_ACTIONS.DELETE_PAGE);
  });

  it("merges action overrides into the active config", () => {
    class CustomCreatePageAction extends ChaiBaseAction<{ name: string }, { id: string }> {
      name = "CUSTOM_CREATE_PAGE";

      async execute() {
        return { id: "custom" };
      }
    }

    const override = new CustomCreatePageAction();
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      actions: {
        CREATE_PAGE: override,
      },
    });

    expect(getConfigBuilderAction("CREATE_PAGE")).toBe(override);
    expect(getChaiAction("CREATE_PAGE")).toBe(override);
  });

  it("merges deprecated builderActions overrides into the active config", () => {
    class CustomCreatePageAction extends ChaiBaseAction<{ name: string }, { id: string }> {
      async execute() {
        return { id: "legacy" };
      }
    }

    const override = new CustomCreatePageAction();
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      builderActions: {
        CREATE_PAGE: override,
      },
    });

    expect(getConfigBuilderAction("CREATE_PAGE")).toBe(override);
  });

  it("syncs block data providers into the block registry", () => {
    const provider = vi.fn(async (_ctx: unknown) => ({ title: "Hello" }));

    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      blockDataProviders: {
        BuildHero: provider,
      },
    });

    expect(getRegisteredChaiBlock("BuildHero")?.dataProvider).toBe(provider);
  });

  it("stores onInit for retrieval via getChaiBuilderConfigOnInit", () => {
    const onInit = vi.fn();

    const config = buildChaiBuilderConfig({ db: stubChaiDbSetup() }, { onInit });

    expect(getChaiBuilderConfigOnInit(config)).toBe(onInit);
  });

  it("returns undefined from getChaiBuilderConfigOnInit when onInit was not provided", () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect(getChaiBuilderConfigOnInit(config)).toBeUndefined();
  });

  it("merges extend keys onto returned config and freezes them", () => {
    const config = buildChaiBuilderConfig(
      { db: stubChaiDbSetup() },
      { extend: { storageUrl: "https://example.com", maxUploadMb: 10 } },
    );

    expect(config.storageUrl).toBe("https://example.com");
    expect(config.maxUploadMb).toBe(10);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("does not include extend keys when extend is omitted", () => {
    const config = buildChaiBuilderConfig({ db: stubChaiDbSetup() });

    expect((config as any).storageUrl).toBeUndefined();
  });
});
