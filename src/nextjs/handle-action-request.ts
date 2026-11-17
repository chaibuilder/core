import { ActionError } from "~/server/chai-actions/action-error";
import { toChaiActionErrorPayload } from "~/server/chai-actions/action-result";
import type { ChaiHttpActionBody } from "~/server/chai-builder/handle-http-action";
import {
  isChaiMultipartActionRequest,
  parseChaiMultipartActionBody,
} from "~/server/chai-builder/parse-multipart-action";

type ChaiHttpActionHandler = (body: ChaiHttpActionBody) => Response | Promise<Response>;

/**
 * Parse a Next.js action request and dispatch it through the request-scoped
 * ChaiBuilder instance. File actions use multipart; ordinary actions use JSON.
 */
export async function handleChaiActionRequest(
  request: Request,
  handleHttpAction: ChaiHttpActionHandler,
): Promise<Response> {
  try {
    let body: ChaiHttpActionBody;
    if (isChaiMultipartActionRequest(request)) {
      body = await parseChaiMultipartActionBody(request);
    } else {
      try {
        body = (await request.json()) as ChaiHttpActionBody;
      } catch {
        throw new ActionError("Malformed JSON request body", "BAD_REQUEST", 400);
      }
    }

    return await handleHttpAction(body);
  } catch (error) {
    const payload = toChaiActionErrorPayload(error);
    return Response.json({ ok: false, error: payload }, { status: payload.status });
  }
}
