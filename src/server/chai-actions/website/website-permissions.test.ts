import { beforeEach, describe, expect, it } from "vitest";
import { buildChaiBuilderConfig } from "~/server/build-config";
import { getChaiAction } from "~/server/chai-actions/actions-registery";
import { runChaiAction, resolveRequiredPermissions } from "~/server/chai-actions/dispatch-action";
import { runInContext } from "~/server/chai-builder/state";
import { resetActiveChaiBuilderConfigForTests } from "~/server/defaults/config-registry";
import { DEFAULT_ROLE_MAPS } from "~/server/rbac/default-roles";
import { stubChaiDbConfig } from "~/tests/setup/stub-chai-db";
import type { ChaiActionContext } from "~/types";

const requiredFor = (actionName: string, data: unknown): string[] =>
  resolveRequiredPermissions(getChaiAction(actionName)!, data, {
    appId: "test-app",
    action: actionName,
  } as ChaiActionContext);

/** True when dispatching got past the permission check (the stub db fails it later, which is fine). */
async function passesPermissionCheck(permissions: string[], action: string, data: unknown): Promise<boolean> {
  try {
    await runInContext({ appId: "test-app", userId: "user-1", permissions }, () => runChaiAction(action, data));
    return true;
  } catch (error) {
    return (error as { code?: string }).code !== "FORBIDDEN";
  }
}

beforeEach(() => {
  resetActiveChaiBuilderConfigForTests();
  buildChaiBuilderConfig({ db: stubChaiDbConfig() });
});

describe("PUBLISH_CHANGES permission", () => {
  it("asks pages:publish for pages and theme:publish for the theme and the design tokens", () => {
    expect(requiredFor("PUBLISH_CHANGES", { ids: ["page-1"] })).toEqual(["pages:publish"]);
    expect(requiredFor("PUBLISH_CHANGES", { ids: ["THEME"] })).toEqual(["theme:publish"]);
    expect(requiredFor("PUBLISH_CHANGES", { ids: ["DESIGN_TOKENS"] })).toEqual(["theme:publish"]);
    expect(requiredFor("PUBLISH_CHANGES", { ids: ["THEME", "DESIGN_TOKENS", "page-1"] })).toEqual([
      "theme:publish",
      "pages:publish",
    ]);
  });

  it("refuses the design tokens to a page publisher", async () => {
    expect(await passesPermissionCheck(["pages:publish"], "PUBLISH_CHANGES", { ids: ["DESIGN_TOKENS"] })).toBe(false);
    expect(await passesPermissionCheck(["theme:publish"], "PUBLISH_CHANGES", { ids: ["DESIGN_TOKENS"] })).toBe(true);
  });

  it.each(["app:publish_theme", "design_tokens:publish", "app:*"])(
    "still lets a stored role granting the retired %s publish",
    async (legacy) => {
      expect(await passesPermissionCheck([legacy], "PUBLISH_CHANGES", { ids: ["THEME"] })).toBe(true);
    },
  );
});

describe("UPDATE_WEBSITE_FIELDS permission", () => {
  it("asks the key of what the payload saves", () => {
    expect(requiredFor("UPDATE_WEBSITE_FIELDS", { settings: { theme: {} } })).toEqual(["theme:edit"]);
    expect(requiredFor("UPDATE_WEBSITE_FIELDS", { settings: { designTokens: {} } })).toEqual(["design_tokens:edit"]);
    expect(requiredFor("UPDATE_WEBSITE_FIELDS", { settings: { theme: {}, designTokens: {} } })).toEqual([
      "theme:edit",
      "design_tokens:edit",
    ]);
    expect(requiredFor("UPDATE_WEBSITE_FIELDS", { settings: {} })).toEqual(["app:update"]);
  });

  it("lets the default designer role save the theme and the design tokens", async () => {
    const designer = DEFAULT_ROLE_MAPS.designer?.permissions ?? [];
    const both = { settings: { theme: {}, designTokens: {} } };
    expect(await passesPermissionCheck(designer, "UPDATE_WEBSITE_FIELDS", both)).toBe(true);
    expect(await passesPermissionCheck(designer, "PUBLISH_CHANGES", { ids: ["THEME", "DESIGN_TOKENS"] })).toBe(true);
  });

  it("no longer saves the theme on app:update alone", async () => {
    expect(await passesPermissionCheck(["app:update"], "UPDATE_WEBSITE_FIELDS", { settings: { theme: {} } })).toBe(
      false,
    );
  });
});
