import { describe, expect, it } from "vitest";
import { ActionError } from "~/server/chai-actions/action-error";
import { createChaiMcpResponse, toSafeChaiMcpError } from "./response";

describe("createChaiMcpResponse", () => {
  it("flags the tools' Error: convention so clients do not read a failure as success", () => {
    expect(createChaiMcpResponse("Error: page not found").isError).toBe(true);
    expect(createChaiMcpResponse("Page created.").isError).toBeUndefined();
  });

  it("lets an explicit flag win over the convention", () => {
    expect(createChaiMcpResponse("Error: expected in body", { isError: false }).isError).toBeUndefined();
    expect(createChaiMcpResponse("all good", { isError: true }).isError).toBe(true);
  });
});

describe("toSafeChaiMcpError", () => {
  it("passes a caller-caused failure through so an agent can act on it", () => {
    expect(toSafeChaiMcpError(new ActionError("Missing permission: pages:publish", "FORBIDDEN", 403))).toBe(
      "Error: Missing permission: pages:publish",
    );
  });

  it("hides an internal failure, which can carry connection strings or SQL", () => {
    const error = new Error("connect ECONNREFUSED postgres://user:hunter2@10.0.0.1:5432");
    expect(toSafeChaiMcpError(error)).toBe("Error: The request could not be completed.");
  });

  it("hides a 5xx action error too", () => {
    expect(toSafeChaiMcpError(new ActionError("relation app_pages does not exist", "DB_ERROR", 500))).toBe(
      "Error: The request could not be completed.",
    );
  });
});
