import { beforeEach, describe, expect, it } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { getChaiAction } from "~/server/chai-actions/actions-registery";
import { resolveRequiredPermissions } from "~/server/chai-actions/dispatch-action";
import { runInContext } from "~/server/chai-builder/state";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { stubChaiDbConfig } from "~/tests/setup/stub-chai-db";
import type { ChaiActionContext } from "~/types";
import { runChaiAction } from "~/server/chai-actions/dispatch-action";
import { touchesSeoFields, updatePagePermission } from "./seo-permission";

const context = { appId: "test-app", action: "UPDATE_PAGE" } as ChaiActionContext;

/** Resolves the permissions the registered action would demand for this payload. */
function requiredFor(actionName: string, data: unknown): string[] {
  const action = getChaiAction(actionName)!;
  return resolveRequiredPermissions(action, data, { ...context, action: actionName });
}

/** Runs the action and returns the ActionError code it failed with, if any. */
async function failureCode(permissions: string[], data: unknown): Promise<string | undefined> {
  try {
    await runInContext({ appId: "test-app", userId: "user-1", permissions }, () => runChaiAction("UPDATE_PAGE", data));
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("touchesSeoFields", () => {
  it.each(["seo", "jsonld", "globalJsonLds"])("detects %s", (field) => {
    expect(touchesSeoFields({ id: "p1", [field]: {} })).toBe(true);
  });

  it("ignores payloads that carry none of them", () => {
    expect(touchesSeoFields({ id: "p1", blocks: [], name: "About", tracking: {} })).toBe(false);
  });

  // `undefined` is what a client that never set the field sends; an explicit
  // `null`/`{}` is a write to that field and must still be gated.
  it("treats an explicitly cleared field as a write", () => {
    expect(touchesSeoFields({ id: "p1", seo: null })).toBe(true);
    expect(touchesSeoFields({ id: "p1", seo: undefined })).toBe(false);
  });

  it("is safe on non-objects", () => {
    expect(touchesSeoFields(undefined)).toBe(false);
    expect(touchesSeoFields("seo")).toBe(false);
  });
});

describe("updatePagePermission", () => {
  it("requires only pages:update for a blocks-only save", () => {
    expect(updatePagePermission({ id: "p1", blocks: [] }, context)).toBe("pages:update");
  });

  it("adds pages:edit_seo when the payload carries seo", () => {
    expect(updatePagePermission({ id: "p1", seo: { title: "x" } }, context)).toEqual([
      "pages:update",
      "pages:edit_seo",
    ]);
  });
});

describe("registered page actions", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
    buildChaiBuilderConfig({ db: stubChaiDbConfig() });
  });

  it("wires the SEO-aware resolver onto UPDATE_PAGE", () => {
    expect(requiredFor("UPDATE_PAGE", { id: "p1", blocks: [] })).toEqual(["pages:update"]);
    expect(requiredFor("UPDATE_PAGE", { id: "p1", seo: { title: "x" } })).toEqual(["pages:update", "pages:edit_seo"]);
  });

  // `metadata` is the description/tags blob; the SEO columns are separate and
  // nothing reads them out of `metadata`, so the SEO gate does not apply here.
  it("keeps UPDATE_PAGE_METADATA on plain pages:update", () => {
    expect(requiredFor("UPDATE_PAGE_METADATA", { id: "p1", metadata: {} })).toEqual(["pages:update"]);
    expect(requiredFor("UPDATE_PAGE_METADATA", { id: "p1", metadata: { globalJsonLds: [] } })).toEqual([
      "pages:update",
    ]);
  });

  // The panel's own `pages:edit_seo` check is client-side only; this is the gate
  // that also covers the HTTP action, the instance API and the MCP tools.
  it("refuses an SEO write from a pages:update-only session", async () => {
    await expect(
      runInContext({ appId: "test-app", userId: "user-1", permissions: ["pages:update"] }, () =>
        runChaiAction("UPDATE_PAGE", { id: "p1", seo: { title: "hijacked" } }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Missing permission: pages:edit_seo" });
  });

  // The stub DB makes the action itself fail past the gate; only the gate is under
  // test here, so assert the failure is never the permission one.
  it("lets the same session through for a blocks-only save", async () => {
    expect(await failureCode(["pages:update"], { id: "p1", blocks: [] })).not.toBe("FORBIDDEN");
  });

  it("lets a pages:* session write SEO", async () => {
    expect(await failureCode(["pages:*"], { id: "p1", seo: { title: "ok" } })).not.toBe("FORBIDDEN");
  });
});
