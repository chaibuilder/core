import { describe, expect, it } from "vitest";
import { pickDefaultGlobalJsonLdIds, type GlobalJsonLdSchemaRow } from "./default-global-jsonlds";

const row = (over: Partial<GlobalJsonLdSchemaRow> & { id: string }): GlobalJsonLdSchemaRow => ({
  primaryPage: null,
  metadata: {},
  ...over,
});

describe("pickDefaultGlobalJsonLdIds", () => {
  it("keeps only the rows flagged addToNewPages", () => {
    const rows = [
      row({ id: "a", metadata: { addToNewPages: true } }),
      row({ id: "b", metadata: { addToNewPages: false } }),
      row({ id: "c", metadata: { description: "no flag" } }),
    ];

    expect(pickDefaultGlobalJsonLdIds(rows)).toEqual(["a"]);
  });

  // The builder's edit dialog read `applyToNewPages` while every writer wrote
  // `addToNewPages` (#3875). Both spellings are honoured so no row is ever missed.
  it("tolerates the legacy applyToNewPages spelling", () => {
    expect(pickDefaultGlobalJsonLdIds([row({ id: "a", metadata: { applyToNewPages: true } })])).toEqual([
      "a",
    ]);
  });

  // A page stores primary ids; getPageGlobalJSONLds picks the right-language row
  // from them at render time.
  it("resolves language variants to their primary and de-duplicates", () => {
    const rows = [
      row({ id: "fr", primaryPage: "primary", metadata: { addToNewPages: true } }),
      row({ id: "es", primaryPage: "primary", metadata: { addToNewPages: true } }),
      row({ id: "other", metadata: { addToNewPages: true } }),
    ];

    expect(pickDefaultGlobalJsonLdIds(rows)).toEqual(["primary", "other"]);
  });

  it("is safe on rows with no metadata", () => {
    expect(pickDefaultGlobalJsonLdIds([row({ id: "a", metadata: null })])).toEqual([]);
    expect(pickDefaultGlobalJsonLdIds([])).toEqual([]);
  });

  // A truthy-but-not-true value is a corrupted flag, not an opt-in.
  it("requires the flag to be exactly true", () => {
    expect(pickDefaultGlobalJsonLdIds([row({ id: "a", metadata: { addToNewPages: "yes" } })])).toEqual([]);
  });
});
