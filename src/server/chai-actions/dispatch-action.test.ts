import { beforeEach, describe, expect, it } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { stubChaiDbConfig } from "~/tests/setup/stub-chai-db";
import { runInContext } from "~/server/chai-builder/state";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { registerChaiPermissions, resetChaiPermissionsForTests } from "~/server/plugin-api/permission-registry";
import { ChaiBaseAction } from "./base-action";
import { ChaiBaseAiAction } from "./base-ai-action";
import { runChaiAction, tryChaiAction } from "./dispatch-action";

/** A member of the app, as the context resolver would report them. */
const member = (permissions: string[], role = "editor") => ({
  appId: "test-app",
  userId: "user-1",
  role,
  permissions,
});

/** Registers a gated action so `enforcePermission` has something to enforce. */
function registerGatedAction(name: string, requiredPermission: string | string[]) {
  class GatedAction extends ChaiBaseAction<unknown, { ok: true }> {
    public requiredPermission = requiredPermission;
    async execute() {
      return { ok: true } as const;
    }
  }
  const action = new GatedAction();
  buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { [name]: action } });
  return action;
}

describe("dispatchChaiAction", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  it("throws when userId is missing for authenticated actions", async () => {
    await expect(runInContext({ appId: "test-app" }, () => runChaiAction("GET_DRAFT_PAGE", {}))).rejects.toThrow(
      /initWithUser/,
    );
  });

  it("dispatches authenticated actions for a member", async () => {
    const result = await runInContext(member(["*"], "admin"), () => runChaiAction("CHECK_USER_ACCESS", {}));

    expect(result).toMatchObject({ access: true, role: "admin" });
  });

  it("throws ACTION_NOT_FOUND for unknown actions", async () => {
    await expect(runInContext(member(["*"]), () => runChaiAction("UNKNOWN_ACTION", {}))).rejects.toMatchObject({
      code: "ACTION_NOT_FOUND",
    });
  });

  // The resolver is the only authority; no permissions means it did not recognise this user
  // as a member, and there is nobody left to ask.
  it("rejects an authenticated user the resolver granted no permissions", async () => {
    await expect(
      runInContext({ appId: "test-app", userId: "user-1" }, () => runChaiAction("CREATE_PAGE", {})),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("reports the resolver's decision through CHECK_USER_ACCESS", async () => {
    const result = await runInContext(member(["pages:read"]), () => runChaiAction("CHECK_USER_ACCESS", {}));

    expect(result).toEqual({ access: true, role: "editor", permissions: ["pages:read"], userId: "user-1" });
  });

  it("defaults the role label when the resolver supplies permissions without one", async () => {
    const result = (await runInContext({ appId: "test-app", userId: "user-1", permissions: [] }, () =>
      runChaiAction("CHECK_USER_ACCESS", {}),
    )) as { role: string };

    expect(result.role).toBe("custom");
  });

  it("runs a gated action the user is granted", async () => {
    registerGatedAction("GATED_READ", "pages:read");

    const result = await runInContext(member(["pages:read"]), () => runChaiAction("GATED_READ", {}));

    expect(result).toEqual({ ok: true });
  });

  it("denies a gated action the user is not granted", async () => {
    registerGatedAction("GATED_UPDATE", "pages:update");

    await expect(runInContext(member(["pages:read"]), () => runChaiAction("GATED_UPDATE", {}))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // Array form: every listed key must be held (the SEO gate on UPDATE_PAGE).
  it("requires every key of a list-form permission", async () => {
    registerGatedAction("GATED_LIST", ["pages:update", "pages:edit_seo"]);

    await expect(runInContext(member(["pages:update"]), () => runChaiAction("GATED_LIST", {}))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Missing permission: pages:edit_seo",
    });
  });

  it("runs a list-form action when every key is held", async () => {
    registerGatedAction("GATED_LIST_OK", ["pages:update", "pages:edit_seo"]);

    const result = await runInContext(member(["pages:update", "pages:edit_seo"]), () =>
      runChaiAction("GATED_LIST_OK", {}),
    );

    expect(result).toEqual({ ok: true });
  });

  // Function form: the permission is derived from the payload, so the same action
  // can be open for one shape and gated for another.
  it("derives the permission from the payload", async () => {
    class DerivedAction extends ChaiBaseAction<{ seo?: unknown }, { ok: true }> {
      public requiredPermission = (data: { seo?: unknown }) =>
        data?.seo ? ["pages:update", "pages:edit_seo"] : "pages:update";
      async execute() {
        return { ok: true } as const;
      }
    }
    buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { GATED_DERIVED: new DerivedAction() } });

    await expect(runInContext(member(["pages:update"]), () => runChaiAction("GATED_DERIVED", {}))).resolves.toEqual({
      ok: true,
    });
    await expect(
      runInContext(member(["pages:update"]), () => runChaiAction("GATED_DERIVED", { seo: {} })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // Overriding CHECK_USER_ACCESS changes what the client is told, never what is enforced.
  it("keeps enforcing the resolver's decision when CHECK_USER_ACCESS is overridden", async () => {
    class LyingCheckUserAccess extends ChaiBaseAction<unknown, { access: boolean }> {
      async execute() {
        return { access: true, role: "admin", permissions: ["*"] };
      }
    }
    buildChaiBuilderConfig({
      db: stubChaiDbConfig(),
      actions: { CHECK_USER_ACCESS: new LyingCheckUserAccess() },
    });
    registerGatedAction("GATED_UPDATE", "pages:update");

    await expect(runInContext(member(["pages:read"]), () => runChaiAction("GATED_UPDATE", {}))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("dispatchChaiAction — delegated permissions", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  it("clamps permissions to the delegated ceiling", async () => {
    registerGatedAction("GATED_UPDATE", "pages:update");

    await expect(
      runInContext({ ...member(["*"], "admin"), delegatedPermissions: ["pages:read"] }, () =>
        runChaiAction("GATED_UPDATE", {}),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows what the delegated ceiling grants", async () => {
    registerGatedAction("GATED_READ", "pages:read");

    const result = await runInContext({ ...member(["*"], "admin"), delegatedPermissions: ["pages:read"] }, () =>
      runChaiAction("GATED_READ", {}),
    );

    expect(result).toEqual({ ok: true });
  });

  it("honours the deprecated delegatedScopes name", async () => {
    registerGatedAction("GATED_UPDATE", "pages:update");

    await expect(
      runInContext({ ...member(["*"], "admin"), delegatedScopes: ["pages:read"] }, () =>
        runChaiAction("GATED_UPDATE", {}),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps host-defined permission keys intersectable", async () => {
    registerGatedAction("GATED_CUSTOM", "custom:thing");

    const result = await runInContext(
      { ...member(["*", "custom:thing"], "admin"), delegatedPermissions: ["custom:thing"] },
      () => runChaiAction("GATED_CUSTOM", {}),
    );

    expect(result).toEqual({ ok: true });
  });

  // A delegated entity wildcard only expands against the runtime catalog, so
  // plugin-registered permission keys must be part of it.
  it("expands a delegated wildcard over plugin-registered permissions", async () => {
    class GatedAction extends ChaiBaseAction<unknown, { ok: true }> {
      public requiredPermission = "widgets:read";
      async execute() {
        return { ok: true } as const;
      }
    }
    buildChaiBuilderConfig({
      db: stubChaiDbConfig(),
      actions: { GATED_WIDGET: new GatedAction() },
    });
    registerChaiPermissions("test:widgets", ["widgets:read", "widgets:update"]);
    try {
      const result = await runInContext({ ...member(["*"], "admin"), delegatedPermissions: ["widgets:*"] }, () =>
        runChaiAction("GATED_WIDGET", {}),
      );

      expect(result).toEqual({ ok: true });
    } finally {
      resetChaiPermissionsForTests();
    }
  });

  it("denies everything when the delegated ceiling is empty", async () => {
    registerGatedAction("GATED_READ", "pages:read");

    await expect(
      runInContext({ ...member(["*"], "admin"), delegatedPermissions: [] }, () => runChaiAction("GATED_READ", {})),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports the clamped permission set to the builder UI", async () => {
    const result = (await runInContext({ ...member(["*"], "admin"), delegatedPermissions: ["pages:read"] }, () =>
      runChaiAction("CHECK_USER_ACCESS", {}),
    )) as { permissions: string[] };

    expect(result.permissions).toEqual(["pages:read"]);
  });
});

describe("tryChaiAction", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  it("returns ok:false for missing user context", async () => {
    const result = await runInContext({ appId: "test-app" }, () => tryChaiAction("GET_DRAFT_PAGE", {}));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
    }
  });

  it("returns ok:true for successful dispatch", async () => {
    const result = await runInContext(member(["*"], "admin"), () => tryChaiAction("CHECK_USER_ACCESS", {}));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ access: true, role: "admin" });
    }
  });
});

describe("dispatchChaiAction — surface", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  /** Registers an action that echoes the context the dispatcher handed it. */
  function registerEchoAction(name: string) {
    class EchoAction extends ChaiBaseAction<unknown, { surface: unknown }> {
      async execute() {
        return { surface: this.context?.surface };
      }
    }
    const action = new EchoAction();
    buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { [name]: action } });
    return action;
  }

  it("hands the resolver's surface to authenticated actions", async () => {
    registerEchoAction("ECHO_SURFACE");

    const result = await runInContext({ ...member(["*"], "admin"), surface: "settings" }, () =>
      runChaiAction("ECHO_SURFACE", {}),
    );

    expect(result).toEqual({ surface: "settings" });
  });

  it("leaves the surface null when the resolver did not state one", async () => {
    registerEchoAction("ECHO_SURFACE");

    const result = await runInContext(member(["*"], "admin"), () => runChaiAction("ECHO_SURFACE", {}));

    expect(result).toEqual({ surface: null });
  });
});

describe("dispatchChaiAction — concurrent requests", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  // One registered instance serves every request; a request that awaits mid-run must not
  // see the context or per-run fields of one dispatched in the meantime.
  it("gives each dispatch its own context and per-run fields", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    class SlowAction extends ChaiBaseAction<{ input: string; wait?: boolean }, unknown> {
      private input = "";
      constructor(private readonly storage: string) {
        super();
      }
      async execute(data: { input: string; wait?: boolean }) {
        this.input = data.input;
        if (data.wait) await gate;
        return {
          userId: this.context?.userId,
          permissions: this.context?.userAccess?.permissions,
          input: this.input,
          storage: this.storage,
        };
      }
    }
    const action = new SlowAction("s3");
    action.requiredPermission = "pages:read";
    buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { SLOW: action } });

    const first = runInContext({ ...member(["pages:read"]), userId: "user-a" }, () =>
      runChaiAction("SLOW", { input: "a", wait: true }),
    );
    const second = await runInContext({ ...member(["pages:read", "pages:unpublish"]), userId: "user-b" }, () =>
      runChaiAction("SLOW", { input: "b" }),
    );
    release();

    expect(await first).toEqual({ userId: "user-a", permissions: ["pages:read"], input: "a", storage: "s3" });
    expect(second).toEqual({
      userId: "user-b",
      permissions: ["pages:read", "pages:unpublish"],
      input: "b",
      storage: "s3",
    });
    // A dispatch never mutates the registered instance.
    expect((action as unknown as { context: unknown }).context).toBeNull();
  });

  it("enforces a permission set on the registered instance", async () => {
    class PlainAction extends ChaiBaseAction<unknown, { ok: true }> {
      async execute() {
        return { ok: true } as const;
      }
    }
    const action = new PlainAction();
    action.requiredPermission = "pages:update";
    buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { PLAIN: action } });

    await expect(runInContext(member(["pages:read"]), () => runChaiAction("PLAIN", {}))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // `features.ai: false` turns builder AI off: a model-calling action must not run even for
  // a caller who holds `ai:*` and sends the request directly.
  it("refuses AI actions when features.ai is off, and runs them by default", async () => {
    class ModelCallAction extends ChaiBaseAiAction<unknown, { ok: true }> {
      async execute() {
        return { ok: true } as const;
      }
    }
    const action = new ModelCallAction();
    action.requiredPermission = "ai:use";

    buildChaiBuilderConfig({ db: stubChaiDbConfig(), actions: { MODEL_CALL: action } });
    await expect(runInContext(member(["ai:*"]), () => runChaiAction("MODEL_CALL", {}))).resolves.toEqual({
      ok: true,
    });

    buildChaiBuilderConfig({ db: stubChaiDbConfig(), features: { ai: false }, actions: { MODEL_CALL: action } });
    await expect(runInContext(member(["ai:*"]), () => runChaiAction("MODEL_CALL", {}))).rejects.toMatchObject({
      code: "AI_DISABLED",
      status: 403,
    });
  });
});
