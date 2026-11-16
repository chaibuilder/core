import { afterEach, describe, expect, it } from "vitest";
import { captureConsola } from "~/tests/utils/capture-consola";
import { getOptionalRequestState, runInContext } from "~/server/chai-builder/state";
import { setGlobalDebugLevel } from "./debug-level";
import { withRenderPhase } from "./debug-timing";
import { ensureTrace } from "./debug-trace";

const log = captureConsola();

describe("withRenderPhase", () => {
  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
  });

  it("skips phase logs below level 1", async () => {
    await withRenderPhase("ChaiPageCSS", async () => "ok");
    expect(log.messages("info", "ChaiDebug")).toEqual([]);
  });

  it("logs phase start and complete at level 1 within request trace", async () => {
    setGlobalDebugLevel(1);

    await runInContext({ appId: "app-1", draft: false }, async () => {
      ensureTrace("renderPage", "slug=/");
      await withRenderPhase("ChaiPageCSS", async () => "ok");
    });

    const messages = log.messages("info", "ChaiDebug");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("▶ ChaiPageCSS");
    expect(messages[1]).toContain("◀ ChaiPageCSS");
  });
});

describe("runInContext reuse", () => {
  it("reuses request state for the same app within a page request", async () => {
    let outerTraceId: string | null = null;
    let innerTraceId: string | null = null;

    runInContext({ appId: "app-1", draft: false }, () => {
      ensureTrace("renderPage", "slug=/");
      outerTraceId = getOptionalRequestState()?.traceId ?? null;

      runInContext({ appId: "app-1", draft: false }, () => {
        innerTraceId = getOptionalRequestState()?.traceId ?? null;
      });
    });

    expect(outerTraceId).toBeTruthy();
    expect(innerTraceId).toBe(outerTraceId);
  });
});
