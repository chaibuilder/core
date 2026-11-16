import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mswServer } from "~/tests/builder/msw";
import { captureConsola } from "~/tests/utils/capture-consola";
import { debugFetch } from "./debug-fetch";
import { setGlobalDebugLevel } from "./debug-level";

const log = captureConsola();

describe("debugFetch", () => {
  beforeEach(() => {
    mswServer.use(http.get("https://example.com/image.jpg", () => new HttpResponse("ok", { status: 200 })));
  });

  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
  });

  it("does not log when debug level is 0", async () => {
    const response = await debugFetch("https://example.com/image.jpg");

    expect(response.status).toBe(200);
    expect(log.messages("info", "ChaiDebug")).toEqual([]);
  });

  it("logs fetch metadata when debug level is 1", async () => {
    setGlobalDebugLevel(1);

    const response = await debugFetch("https://example.com/image.jpg");

    expect(response.status).toBe(200);
    const messages = log.messages("info", "ChaiDebug");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/fetch \d+ms · GET https:\/\/example\.com\/image\.jpg · 200/);
  });
});
