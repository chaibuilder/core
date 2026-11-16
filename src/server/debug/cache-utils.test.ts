import { afterEach, describe, expect, it } from "vitest";
import { captureConsola } from "~/tests/utils/capture-consola";
import { withRequestCache } from "~/server/chai-builder/public/cache-utils";
import { getOptionalRequestState } from "~/server/chai-builder/state";
import { setGlobalDebugLevel } from "~/server/debug/debug-level";
import { withRequestContext } from "~/tests/setup/request-context";

const log = captureConsola();

describe("cache-utils", () => {
  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
  });

  it("logs request cache miss then hit for repeated calls", async () => {
    setGlobalDebugLevel(1);

    const fetchData = async (slug: string) => slug;
    const cached = withRequestCache(fetchData, "getPage");

    await withRequestContext(async () => {
      await expect(cached("home")).resolves.toBe("home");

      // First call: a request-level MISS is logged and the key is recorded on the request state.
      const misses = log.messages("warn", "ChaiDebug");
      expect(misses).toHaveLength(1);
      expect(misses[0]).toContain("cache MISS · request · getPage");
      expect(log.messages("success", "ChaiDebug")).toEqual([]);
      expect(getOptionalRequestState()!.cacheKeys.size).toBe(1);

      await expect(cached("home")).resolves.toBe("home");

      // Same args again: a HIT is logged from the request-state ledger. react.cache does not
      // memoise outside an RSC render, so the underlying MISS log is not asserted a second time.
      const hits = log.messages("success", "ChaiDebug");
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("cache HIT · request · getPage");
      expect(getOptionalRequestState()!.cacheKeys.size).toBe(1);
    });
  });
});
