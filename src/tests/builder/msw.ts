import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { chaiApiHandlers } from "./chai-api-handlers";

/** The worker-wide msw server. Started by the test setup; handlers added per test are reset after each. */
export const mswServer = setupServer(...chaiApiHandlers);

type ChaiActionResponder<T> = T | ((data: any, request: Request) => T | Promise<T>);

export type MockedChaiAction = {
  /** The `data` payload of every request this handler answered, in order. */
  calls: any[];
};

/**
 * Answers one builder action on the real `POST /chai/api` endpoint for the current test. The
 * component under test runs its real fetch, react-query and response parsing; only the server
 * reply is supplied. Other actions fall through to the default handlers.
 *
 *   mockChaiAction("GET_DRAFT_PAGE", { id: "page-1", blocks: [] });
 *   mockChaiAction("UPDATE_PAGE", (data) => ({ ...data, id: "page-1" }));
 *   mockChaiAction("PUBLISH_CHANGES", { message: "nope" }, { ok: false, status: 500 });
 */
export function mockChaiAction<T>(
  action: string,
  responder: ChaiActionResponder<T>,
  options: { ok?: boolean; status?: number } = {},
): MockedChaiAction {
  const mocked: MockedChaiAction = { calls: [] };
  mswServer.use(
    http.post("*/chai/api", async ({ request }) => {
      const body = (await request
        .clone()
        .json()
        .catch(() => null)) as { action?: string; data?: any } | null;
      if (String(body?.action ?? "").toUpperCase() !== action.toUpperCase()) {
        return undefined;
      }
      mocked.calls.push(body?.data);
      const data =
        typeof responder === "function"
          ? await (responder as (data: any, request: Request) => T | Promise<T>)(body?.data, request)
          : responder;
      const status = options.status ?? (options.ok === false ? 500 : 200);
      return HttpResponse.json(options.ok === false ? { ok: false, error: data } : { ok: true, data }, { status });
    }),
  );
  return mocked;
}
