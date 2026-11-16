import { describe, expect, it } from "vitest";
import type { ChaiPageTypeEntry } from "~/types/chaibuilder-config";
import { serializePageTypesForClient } from "./serialize-page-types";

const TRACKING = { gtm: { id: "GTM-1" }, forms: { revenueType: "new" }, fb: {} };

describe("serializePageTypesForClient", () => {
  it("carries defaultTrackingInfo() as trackingDefault alongside the SEO/JSON-LD defaults", async () => {
    const [serialized] = await serializePageTypesForClient([
      {
        key: "showroom_vdp",
        name: "Showroom",
        defaultTrackingInfo: () => TRACKING,
        defaultSeo: () => ({ title: "t" }),
        defaultJSONLD: () => ({ "@type": "Thing" }),
      } as unknown as ChaiPageTypeEntry,
    ]);

    expect(serialized.trackingDefault).toEqual(TRACKING);
    expect(serialized.defaultSeo).toEqual({ title: "t" });
    expect(serialized.defaultJSONLD).toEqual({ "@type": "Thing" });
    // Must survive the server → client boundary. `toEqual` (not `toStrictEqual`)
    // on purpose: it ignores undefined-valued keys (e.g. an absent `pluralName`),
    // which JSON drops too, while a leaked function or class instance still fails.
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it("omits trackingDefault when the page type declares no defaultTrackingInfo", async () => {
    const [serialized] = await serializePageTypesForClient([
      { key: "page", name: "Page" } as unknown as ChaiPageTypeEntry,
    ]);

    expect(serialized).not.toHaveProperty("trackingDefault");
    expect(serialized).not.toHaveProperty("defaultSeo");
  });
});
