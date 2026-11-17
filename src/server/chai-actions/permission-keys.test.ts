import { describe, expect, it } from "vitest";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { BUILTIN_CHAI_ACTIONS } from "~/server/defaults/builtin-chai-actions";
import { withChaiActionPermission } from "~/server/plugin-api";
import type { ChaiActionContext } from "~/types";
import { ChaiBaseAction } from "./base-action";
import { resolveRequiredPermissions } from "./dispatch-action";
import { getDeclaredChaiPermissionKeys, defineChaiPermissionResolver } from "./permission-keys";

const context = { appId: "test-app" } as ChaiActionContext;

class NoopAction extends ChaiBaseAction<any, { ok: true }> {
  async execute() {
    return { ok: true } as const;
  }
}

describe("declaredPermissionKeysOf", () => {
  it("returns the key for the static string form", () => {
    expect(getDeclaredChaiPermissionKeys("pages:update")).toEqual(["pages:update"]);
  });

  it("returns the list for the list form, dropping empty keys", () => {
    expect(getDeclaredChaiPermissionKeys(["pages:update", "", "pages:edit_seo"])).toEqual([
      "pages:update",
      "pages:edit_seo",
    ]);
  });

  it("returns [] for an ungated action", () => {
    expect(getDeclaredChaiPermissionKeys(undefined)).toEqual([]);
    expect(getDeclaredChaiPermissionKeys(null)).toEqual([]);
  });

  it("returns every key a tagged resolver may require", () => {
    const resolver = defineChaiPermissionResolver(["pages:update", "pages:edit_seo"], (data: any) =>
      data?.seo ? ["pages:update", "pages:edit_seo"] : "pages:update",
    );
    expect(getDeclaredChaiPermissionKeys(resolver)).toEqual(["pages:update", "pages:edit_seo"]);
    // The resolver still resolves per payload — the declared list is the superset.
    expect(resolver({ id: "p1" }, context)).toBe("pages:update");
    expect(resolver({ id: "p1", seo: {} }, context)).toEqual(["pages:update", "pages:edit_seo"]);
  });

  it("hands back a copy, so a caller cannot mutate the declaration", () => {
    const resolver = defineChaiPermissionResolver(["pages:update"], () => "pages:update");
    getDeclaredChaiPermissionKeys(resolver).push("pages:publish");
    expect(resolver.declaredPermissionKeys).toEqual(["pages:update"]);
  });

  // The whole point: a resolver the static audits cannot see is refused loudly at
  // registration instead of silently reading as ungated (#3881 merge sim, B2).
  it("refuses an untagged function form", () => {
    expect(() => getDeclaredChaiPermissionKeys(() => "pages:update")).toThrow(/permissionResolver/);
  });
});

describe("withActionPermission", () => {
  it("records the static key", () => {
    const action = withChaiActionPermission(new NoopAction(), "pages:read");
    expect(action.requiredPermission).toBe("pages:read");
    expect(action.declaredPermissionKeys).toEqual(["pages:read"]);
  });

  it("records every key of a tagged resolver", () => {
    const action = withChaiActionPermission(
      new NoopAction(),
      defineChaiPermissionResolver(["pages:update", "pages:edit_seo"], (data: any) =>
        data?.seo ? ["pages:update", "pages:edit_seo"] : "pages:update",
      ),
    );
    expect(action.declaredPermissionKeys).toEqual(["pages:update", "pages:edit_seo"]);
  });

  it("throws on an untagged function rather than registering an opaque gate", () => {
    expect(() => withChaiActionPermission(new NoopAction(), () => "pages:update")).toThrow(/permissionResolver/);
  });
});

describe("the builtin registry", () => {
  // What #3885's tool-permission superset guard reads instead of parsing the
  // registration source: UPDATE_PAGE is function-form, and both of its keys are
  // still visible without dispatching.
  it("declares both keys UPDATE_PAGE can require", () => {
    expect(typeof BUILTIN_CHAI_ACTIONS.UPDATE_PAGE.requiredPermission).toBe("function");
    expect(BUILTIN_CHAI_ACTIONS.UPDATE_PAGE.declaredPermissionKeys).toEqual([
      CHAI_PERMISSIONS["pages:update"],
      CHAI_PERMISSIONS["pages:edit_seo"],
    ]);
  });

  it("declares the static keys verbatim", () => {
    expect(BUILTIN_CHAI_ACTIONS.CREATE_PAGE.declaredPermissionKeys).toEqual(["pages:create"]);
    expect(BUILTIN_CHAI_ACTIONS.UPDATE_PAGE_METADATA.declaredPermissionKeys).toEqual(["pages:update"]);
    expect(BUILTIN_CHAI_ACTIONS.TAKE_OFFLINE.declaredPermissionKeys).toEqual(["pages:unpublish"]);
  });

  it("declares every key a payload-aware resolver may ask for", () => {
    expect(BUILTIN_CHAI_ACTIONS.PUBLISH_CHANGES.declaredPermissionKeys).toEqual(["pages:publish", "theme:publish"]);
    expect(BUILTIN_CHAI_ACTIONS.UPDATE_WEBSITE_FIELDS.declaredPermissionKeys).toEqual([
      "theme:edit",
      "design_tokens:edit",
      "app:update",
    ]);
  });

  it("gives every registered action a declaration", () => {
    const missing = Object.entries(BUILTIN_CHAI_ACTIONS)
      .filter(([, action]) => !Array.isArray(action.declaredPermissionKeys))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  // No payload may demand a key the declaration does not list — otherwise the
  // superset the guards read is a lie.
  it("never requires a key outside its declaration", () => {
    const payloads: unknown[] = [
      {},
      { id: "p1" },
      { id: "p1", blocks: [] },
      { id: "p1", seo: { title: "x" } },
      { id: "p1", jsonld: {} },
      { id: "p1", globalJsonLds: [] },
    ];
    for (const [name, action] of Object.entries(BUILTIN_CHAI_ACTIONS)) {
      const declared = action.declaredPermissionKeys ?? [];
      for (const payload of payloads) {
        const required = resolveRequiredPermissions(action, payload, { ...context, action: name });
        expect(
          required.filter((key) => !declared.includes(key)),
          `${name} for ${JSON.stringify(payload)}`,
        ).toEqual([]);
      }
    }
  });
});
