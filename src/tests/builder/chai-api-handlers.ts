import { http, HttpResponse } from "msw";

/**
 * Stub payloads for the builder actions that mount-and-render tests trigger on
 * their own. Add an entry when a component fetches something it needs to read;
 * a test that cares about the shape should call `mockChaiAction()` (./msw.ts).
 */
const ACTION_STUBS: Record<string, unknown> = {
  GET_WEBSITE_PAGES: [],
  GET_PAGE_TYPES: [],
};

/**
 * Every builder action rides one POST endpoint, so simply rendering a builder
 * component fires real requests at `/chai/api`. Unhandled, msw lets them reach
 * the network, where they fail *after* the test file has finished — vitest then
 * reports the late `console.error` as an unhandled `EnvironmentTeardownError`
 * ("Closing rpc while onUserConsoleLog was pending"). Answering here keeps the
 * request in-band; unknown actions still fail, just synchronously.
 */
const chaiAction = http.post("*/chai/api", async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = String(body?.action ?? "").toUpperCase();

  if (action in ACTION_STUBS) {
    return HttpResponse.json({ ok: true, data: ACTION_STUBS[action] });
  }

  return HttpResponse.json(
    {
      ok: false,
      error: { code: "UNHANDLED_ACTION", message: `No msw handler for chai action "${action}"`, status: 501 },
    },
    { status: 501 },
  );
});

export const chaiApiHandlers = [chaiAction];
