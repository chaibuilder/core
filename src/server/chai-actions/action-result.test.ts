import { describe, expect, it } from "vitest";
import { ActionError } from "./action-error";
import { isChaiActionFailure, isChaiActionSuccess, toChaiActionError, toChaiActionErrorPayload } from "./action-result";

describe("action-result helpers", () => {
  it("serializes ActionError to payload", () => {
    const error = new ActionError("Slug already exists", "SLUG_ALREADY_USED", 409, undefined, { slug: "/home" });

    expect(toChaiActionErrorPayload(error)).toEqual({
      code: "SLUG_ALREADY_USED",
      message: "Slug already exists",
      status: 409,
      metadata: { slug: "/home" },
    });
  });

  it("wraps unknown errors as INTERNAL_ERROR", () => {
    expect(toChaiActionErrorPayload(new Error("boom"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "boom",
      status: 500,
    });
  });

  it("normalizes arbitrary errors through toActionError", () => {
    const error = toChaiActionError("unexpected");
    expect(error).toBeInstanceOf(ActionError);
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("identifies result variants", () => {
    const success = { ok: true as const, data: { id: "1" } };
    const failure = {
      ok: false as const,
      error: { code: "UNAUTHORIZED", message: "nope", status: 401 },
    };

    expect(isChaiActionSuccess(success)).toBe(true);
    expect(isChaiActionFailure(failure)).toBe(true);
  });
});
