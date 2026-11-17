import {
  isStreamingChaiAction,
  toChaiActionErrorPayload,
  type ChaiActionFailure,
  type ChaiActionSuccess,
} from "~/server/chai-actions/action-result";
import { runChaiAction } from "~/server/chai-actions/dispatch-action";
import {
  createChaiStreamingErrorResponse,
  formatChaiStreamingError,
  isChaiMissingTextStream,
} from "~/server/chai-actions/streaming-error-handlers";
import { applyChaiActionCacheEffects, DEFAULT_CATCH_ALL_ROUTE } from "~/server/chai-builder/action-cache-effects";
import { runChaiResponseDecorators } from "~/server/plugin-api/response-decorator";

export type ChaiHttpActionBody = {
  action: string;
  data?: unknown;
};

export type HandleHttpChaiActionOptions = {
  catchAllRoute?: string[];
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withExtras<T extends object>(body: T, extras: Record<string, unknown>): T {
  return Object.keys(extras).length > 0 ? { ...extras, ...body } : body;
}

function httpActionErrorResponse(action: string, error: unknown, extras: Record<string, unknown>): Response {
  const payload = toChaiActionErrorPayload(error);

  if (isStreamingChaiAction(action)) {
    const errorMessage = formatChaiStreamingError({
      code: payload.code,
      message: payload.message,
      statusCode: payload.status,
    });
    return createChaiStreamingErrorResponse(payload.code, errorMessage);
  }

  const body: ChaiActionFailure = { ok: false, error: payload };
  return jsonResponse(withExtras(body, extras), payload.status);
}

function httpActionSuccessResponse(data: unknown, extras: Record<string, unknown>): Response {
  const body: ChaiActionSuccess<unknown> = { ok: true, data };
  return jsonResponse(withExtras(body, extras), 200);
}

export async function handleHttpAction(
  body: ChaiHttpActionBody,
  options: HandleHttpChaiActionOptions = {},
): Promise<Response> {
  const { catchAllRoute = DEFAULT_CATCH_ALL_ROUTE } = options;
  const { action, data } = body;

  // Plugin response decorators. Resolved concurrently with the action so their occasional inline work
  // overlaps with the action instead of adding to it. Never gates the action.
  const extrasPromise = runChaiResponseDecorators().catch(() => ({}) as Record<string, unknown>);
  try {
    const result = await runChaiAction(action, data);

    if (result && typeof result === "object" && "_streamingResponse" in result && "_streamResult" in result) {
      const streamingResult = result as {
        _streamResult?: {
          textStream?: ReadableStream;
          dataStream?: Response;
          isDataStream?: boolean;
        };
      };

      if (streamingResult._streamResult?.isDataStream) {
        if (!streamingResult._streamResult.dataStream) {
          return httpActionErrorResponse(
            action,
            {
              code: "NO_STREAM",
              message: "No streaming response available. Please try again.",
              status: 500,
            },
            await extrasPromise,
          );
        }
        return streamingResult._streamResult.dataStream;
      }

      if (isChaiMissingTextStream(streamingResult)) {
        return httpActionErrorResponse(
          action,
          {
            code: "NO_STREAM",
            message: "No streaming response available. Please try again.",
            status: 500,
          },
          await extrasPromise,
        );
      }

      return new Response(streamingResult._streamResult!.textStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    await applyChaiActionCacheEffects(action, result, { catchAllRoute });

    return httpActionSuccessResponse(result, await extrasPromise);
  } catch (error) {
    return httpActionErrorResponse(action, error, await extrasPromise);
  }
}
