import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { getChaiAction } from "~/server/chai-actions/actions-registery";
import { schema } from "~/server/chai-actions/db";
import { getChaiContextResolver, resetChaiContextResolverForTests } from "~/server/chai-context-resolver";
import { resolveChaiBuilderConfig } from "~/server/defaults";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { runInContext } from "~/server/chai-builder/state";
import {
  defineChaiServerPlugin,
  getChaiRequestHeader,
  getContributedChaiInstanceApis,
  getContributedChaiPermissions,
  mergeDefaultRoleGrants,
  registerChaiInstanceApi,
  registerChaiPermissions,
  resetChaiInstanceApisForTests,
  resetChaiPermissionsForTests,
} from "~/server/plugin-api";
import {
  registerChaiRequestMiddleware,
  resetChaiRequestMiddlewareForTests,
  runChaiRequestMiddleware,
} from "~/server/plugin-api/request-middleware";
import {
  registerChaiActionHook,
  resetChaiActionHooksForTests,
  runChaiActionHooks,
} from "~/server/plugin-api/action-hooks";
import { stubChaiDbSetup } from "~/tests/setup/stub-chai-db";
import type { ChaiAction } from "~/types/chai-action";

const stubAction = (name: string): ChaiAction<any, any> =>
  ({ name, execute: async () => ({ ok: name }) }) as unknown as ChaiAction<any, any>;

describe("getChaiRequestHeader", () => {
  it("returns the first value of a header from the current request state, or null", () => {
    const requestHeaders = { get: (name: string) => (name === "x-hint" ? "first, second" : null) };
    const context = { appId: "app-1", requestHeaders } as any;

    expect(runInContext(context, () => getChaiRequestHeader("x-hint"))).toBe("first");
    expect(runInContext(context, () => getChaiRequestHeader("x-missing"))).toBeNull();
    expect(getChaiRequestHeader("x-hint")).toBeNull();
  });
});

describe("server plugins", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    resetChaiContextResolverForTests();
    resetChaiRequestMiddlewareForTests();
    resetChaiActionHooksForTests();
  });

  it("merges plugin actions into the resolved config", () => {
    const action = stubAction("GET_WIDGETS");
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          actions: { GET_WIDGETS: action, ...config.actions },
        })),
      ],
    });

    expect(getChaiAction("GET_WIDGETS")).toBe(action);
  });

  it("lets user action overrides win over plugin actions", () => {
    const fromPlugin = stubAction("GET_WIDGETS");
    const fromUser = stubAction("GET_WIDGETS_USER");
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          actions: { GET_WIDGETS: fromPlugin, ...config.actions },
        })),
      ],
      actions: { GET_WIDGETS: fromUser },
    });

    expect(resolved.actions.GET_WIDGETS).toBe(fromUser);
  });

  it("keeps seeded plugin features under the app's own config", () => {
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          features: { darkMode: true, copyPaste: false, ...config.features },
        })),
      ],
      features: { copyPaste: true },
    });

    expect(resolved.features.darkMode).toBe(true);
    expect(resolved.features.copyPaste).toBe(true);
  });

  it("runs plugins in order, each seeing the previous one's output", () => {
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          defaultRoleGrants: mergeDefaultRoleGrants(config.defaultRoleGrants, { editor: ["first"] }),
        })),
        defineChaiServerPlugin((config) => ({
          ...config,
          defaultRoleGrants: mergeDefaultRoleGrants(config.defaultRoleGrants, {
            editor: [`after:${config.defaultRoleGrants?.editor?.join()}`],
          }),
        })),
      ],
    });

    expect(resolved.defaultRoleGrants.editor).toEqual(["first", "after:first"]);
  });

  it("orders app-contributed hooks after plugin ones, so the app has the final say", () => {
    const appSetup = vi.fn();
    const pluginSetup = vi.fn();
    const appResolver = vi.fn();
    const pluginResolver = vi.fn();
    const appFragment = { pg: { widgets: { __table: "app" } } };
    const pluginFragment = { pg: { widgets: { __table: "plugin" } } };
    const appMiddleware = { name: "app", handler: async () => null };
    const pluginMiddleware = { name: "plugin", handler: async () => null };

    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          schemaFragments: [...(config.schemaFragments ?? []), pluginFragment],
          requestMiddlewares: [...(config.requestMiddlewares ?? []), pluginMiddleware],
          setupHooks: [...(config.setupHooks ?? []), pluginSetup],
          contextResolver: pluginResolver,
        })),
      ],
      schemaFragments: [appFragment],
      requestMiddlewares: [appMiddleware],
      setupHooks: [appSetup],
      contextResolver: appResolver,
    });

    // All four resolve last-one-wins, so the app's entries must come last.
    expect(resolved.schemaFragments).toEqual([pluginFragment, appFragment]);
    expect(resolved.requestMiddlewares).toEqual([pluginMiddleware, appMiddleware]);
    expect(resolved.setupHooks).toEqual([pluginSetup, appSetup]);
    expect(resolved.contextResolver).toBe(appResolver);
  });

  it("falls back to the plugin context resolver when the app sets none", () => {
    const pluginResolver = vi.fn();
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [defineChaiServerPlugin((config) => ({ ...config, contextResolver: pluginResolver }))],
    });

    expect(resolved.contextResolver).toBe(pluginResolver);
  });

  it("unions permission keys registered by multiple plugins", () => {
    resetChaiPermissionsForTests();
    resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => {
          registerChaiPermissions("test:widgets", ["widgets:read", "widgets:update"]);
          return config;
        }),
        defineChaiServerPlugin((config) => {
          registerChaiPermissions("test:gadgets", ["gadgets:read", "widgets:read"]);
          return config;
        }),
      ],
    });

    expect(getContributedChaiPermissions().sort()).toEqual(["gadgets:read", "widgets:read", "widgets:update"]);

    // Re-registration under the same owner replaces, not appends.
    registerChaiPermissions("test:widgets", ["widgets:read"]);
    expect(getContributedChaiPermissions().sort()).toEqual(["gadgets:read", "widgets:read"]);
    resetChaiPermissionsForTests();
  });

  it("registers instance namespaces per plugin, replacing on re-registration", () => {
    resetChaiInstanceApisForTests();
    const getRedirect = async () => null;
    resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => {
          registerChaiInstanceApi("redirectsTest", { getRedirect });
          return config;
        }),
      ],
    });

    expect(getContributedChaiInstanceApis().redirectsTest.getRedirect).toBe(getRedirect);

    // Re-registration under the same namespace replaces, not merges.
    const getAll = async () => [];
    registerChaiInstanceApi("redirectsTest", { getAll });
    expect(getContributedChaiInstanceApis().redirectsTest).toEqual({ getAll });
    resetChaiInstanceApisForTests();
  });

  it("rejects prototype-polluting or non-function instance API registrations", () => {
    resetChaiInstanceApisForTests();
    const fn = async () => null;

    expect(() => registerChaiInstanceApi("__proto__", { fn })).toThrow(/invalid namespace/);
    expect(() => registerChaiInstanceApi("", { fn })).toThrow(/invalid namespace/);
    expect(() => registerChaiInstanceApi("widgets", { ["constructor"]: fn })).toThrow(/invalid function name/);
    expect(() => registerChaiInstanceApi("widgets", { broken: 42 as unknown as () => void })).toThrow(/not a function/);

    // Nothing partial sticks around after a rejected registration.
    expect(Object.keys(getContributedChaiInstanceApis())).toEqual([]);
    resetChaiInstanceApisForTests();
  });

  it("accumulates defaultRoleGrants across plugins via mergeDefaultRoleGrants", () => {
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          defaultRoleGrants: mergeDefaultRoleGrants(config.defaultRoleGrants, {
            editor: ["widgets:read", "widgets:update"],
          }),
        })),
        defineChaiServerPlugin((config) => ({
          ...config,
          defaultRoleGrants: mergeDefaultRoleGrants(config.defaultRoleGrants, {
            editor: ["gadgets:read", "widgets:read"],
            viewer: ["gadgets:read"],
          }),
        })),
      ],
    });

    expect(resolved.defaultRoleGrants).toEqual({
      editor: ["widgets:read", "widgets:update", "gadgets:read"],
      viewer: ["gadgets:read"],
    });
  });

  it("merges plugin trash entries by key", () => {
    const resolved = resolveChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          trash: [
            ...(config.trash ?? []),
            {
              key: "widget",
              label: "Widget",
              moveToTrash: async () => ({}) as any,
              restore: async () => {},
              deletePermanently: async () => true,
            },
          ],
        })),
      ],
    });

    expect(resolved.trash.some((entry) => entry.key === "widget")).toBe(true);
    expect(resolved.features.trash).toBe(true);
  });

  it("merges plugin schema fragments for the active dialect into the registered schema", () => {
    const widgetsTable = { __table: "widgets" };
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          schemaFragments: [
            ...(config.schemaFragments ?? []),
            { pg: { widgets: widgetsTable }, sqlite: { widgets: { __table: "widgets-sqlite" } } },
          ],
        })),
      ],
    });

    expect((schema as any).widgets).toBe(widgetsTable);
  });

  it("registers plugin context resolver, last plugin wins", () => {
    const first = vi.fn();
    const second = vi.fn();
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({ ...config, contextResolver: first })),
        defineChaiServerPlugin((config) => ({ ...config, contextResolver: second })),
      ],
    });

    expect(getChaiContextResolver()).toBe(second);
  });

  it("registers plugin request middleware and runs setup hooks with the resolved config", async () => {
    const setup = vi.fn();
    buildChaiBuilderConfig({
      db: stubChaiDbSetup(),
      plugins: [
        defineChaiServerPlugin((config) => ({
          ...config,
          requestMiddlewares: [
            ...(config.requestMiddlewares ?? []),
            {
              name: "chai:redirects",
              handler: async ({ slug }) => (slug === "/old" ? { redirect: "/new", permanent: true } : null),
            },
          ],
          setupHooks: [...(config.setupHooks ?? []), setup],
        })),
      ],
    });

    expect(setup).toHaveBeenCalledOnce();
    expect(setup.mock.calls[0][0].config.features).toBeDefined();
    await expect(runChaiRequestMiddleware({ slug: "/old", lang: "en" })).resolves.toEqual({
      redirect: "/new",
      permanent: true,
    });
    await expect(runChaiRequestMiddleware({ slug: "/other", lang: "en" })).resolves.toBeNull();
  });

  it("replaces middleware on re-registration under the same name", async () => {
    registerChaiRequestMiddleware("chai:x", async () => ({ redirect: "/a", permanent: false }));
    registerChaiRequestMiddleware("chai:x", async () => ({ redirect: "/b", permanent: false }));
    registerChaiRequestMiddleware("chai:later", async () => null);

    await expect(runChaiRequestMiddleware({ slug: "/", lang: "en" })).resolves.toEqual({
      redirect: "/b",
      permanent: false,
    });
  });

  it("rethrows a throwing middleware instead of falling through to a 404", async () => {
    // Reverse order runs the later registration first: the thrower could not answer, so the
    // request fails rather than letting a lower-priority middleware or the 404 flow decide.
    const good = vi.fn(async () => ({ redirect: "/ok", permanent: false }));
    registerChaiRequestMiddleware("chai:good", good);
    registerChaiRequestMiddleware("chai:bad", async () => {
      throw new Error("boom");
    });

    await expect(runChaiRequestMiddleware({ slug: "/", lang: "en" })).rejects.toThrow("boom");
    expect(good).not.toHaveBeenCalled();
  });

  it("runs action hooks keyed per subscriber, replacing on same key, aggregating tags", async () => {
    const seen: string[] = [];
    registerChaiActionHook("page:slug-changed", "chai:redirects", async ({ appId }) => {
      seen.push(`old-${appId}`);
    });
    registerChaiActionHook("page:slug-changed", "chai:redirects", async ({ appId }) => {
      seen.push(`new-${appId}`);
      return [`redirects-${appId}`];
    });
    registerChaiActionHook("page:slug-changed", "chai:other", async () => ["other-tag"]);

    const tags = await runChaiActionHooks("page:slug-changed", { appId: "app1", slugUpdates: [], userId: null });

    expect(seen).toEqual(["new-app1"]);
    expect(tags).toEqual(["redirects-app1", "other-tag"]);
  });
});
