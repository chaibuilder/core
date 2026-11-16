import { afterEach, describe, expect, it, vi } from "vitest";
import { captureConsola } from "~/tests/utils/capture-consola";
import { setGlobalDebugLevel } from "./debug-level";
import { withDebugTiming } from "./debug-timing";

const log = captureConsola();

describe("withDebugTiming", () => {
  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
    vi.restoreAllMocks();
  });

  it("skips timing logs below level 2", async () => {
    await withDebugTiming("getPage", async () => "ok");
    expect(log.messages("info", "ChaiDebug")).toEqual([]);
  });

  it("logs api timing at level 2", async () => {
    setGlobalDebugLevel(2);
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(142);

    const result = await withDebugTiming("getPage", async () => "ok");

    expect(result).toBe("ok");
    const messages = log.messages("info", "ChaiDebug");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("api 42ms");
    expect(messages[0]).toContain("getPage");
  });
});
