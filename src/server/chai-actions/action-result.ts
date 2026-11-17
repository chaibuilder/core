import { ActionError } from "./action-error";

export type ChaiActionErrorPayload = {
  code: string;
  message: string;
  status: number;
  metadata?: Record<string, unknown>;
};

export type ChaiActionSuccess<T> = { ok: true; data: T };
export type ChaiActionFailure = { ok: false; error: ChaiActionErrorPayload };
export type ChaiActionResult<T> = ChaiActionSuccess<T> | ChaiActionFailure;

// AI_EDIT_PAGE is intentionally NOT listed: it streams AI SDK UIMessage SSE,
// and pre-stream failures (credits, auth, validation) must return plain JSON
// errors with real HTTP statuses so the client chat transport can surface them.
export const STREAMING_CHAI_ACTIONS = new Set(["AI_EDIT_BLOCK", "AI_EDIT_LANG_PAGE", "AI_GENERATE_IMAGE"]);

export function isStreamingChaiAction(action: string): boolean {
  return STREAMING_CHAI_ACTIONS.has(action);
}

export function toChaiActionErrorPayload(error: unknown): ChaiActionErrorPayload {
  if (error instanceof ActionError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.metadata ? { metadata: error.metadata } : {}),
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "status" in error &&
    typeof (error as ChaiActionErrorPayload).code === "string" &&
    typeof (error as ChaiActionErrorPayload).message === "string" &&
    typeof (error as ChaiActionErrorPayload).status === "number"
  ) {
    return error as ChaiActionErrorPayload;
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message,
      status: 500,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong.",
    status: 500,
  };
}

export function toChaiActionError(error: unknown): ActionError {
  if (error instanceof ActionError) {
    return error;
  }

  const payload = toChaiActionErrorPayload(error);
  return new ActionError(payload.message, payload.code, payload.status);
}

export function isChaiActionFailure<T>(result: ChaiActionResult<T>): result is ChaiActionFailure {
  return !result.ok;
}

export function isChaiActionSuccess<T>(result: ChaiActionResult<T>): result is ChaiActionSuccess<T> {
  return result.ok;
}
