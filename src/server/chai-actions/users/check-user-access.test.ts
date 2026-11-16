import { describe, expect, it } from "vitest";
import { ActionError } from "../action-error";
import { CheckUserAccessAction } from "./check-user-access";

describe("CheckUserAccessAction", () => {
  it("returns the authenticated user id from the context", async () => {
    const action = new CheckUserAccessAction();
    action.setContext({
      appId: "test-app",
      userId: "user-42",
      userAccess: { role: "editor", permissions: ["settings:read"] },
    });

    const result = await action.run({});

    expect(result).toEqual({
      access: true,
      role: "editor",
      permissions: ["settings:read"],
      userId: "user-42",
    });
  });

  it("throws when the context carries no user id", async () => {
    const action = new CheckUserAccessAction();
    action.setContext({
      appId: "test-app",
      userAccess: { role: "editor", permissions: [] },
    });

    await expect(action.run({})).rejects.toBeInstanceOf(ActionError);
  });
});
