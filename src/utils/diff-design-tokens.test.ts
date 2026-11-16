import { describe, expect, it } from "vitest";
import { diffDesignTokens, isDesignTokensDiffEmpty } from "./diff-design-tokens";

describe("diffDesignTokens", () => {
  it("lists added, changed and removed tokens by id, sorted by name", () => {
    const diff = diffDesignTokens(
      {
        "dt#keep": { name: "keep", value: "p-2" },
        "dt#edit": { name: "edit", value: "p-2" },
        "dt#rename": { name: "old-name", value: "p-2" },
        "dt#gone": { name: "gone", value: "p-2" },
      },
      {
        "dt#keep": { name: "keep", value: "p-2" },
        "dt#edit": { name: "edit", value: "p-4" },
        "dt#rename": { name: "new-name", value: "p-2" },
        "dt#zeta": { name: "zeta", value: "m-1" },
        "dt#alpha": { name: "alpha", value: "m-1" },
      },
    );

    expect(diff.added.map((t) => t.name)).toEqual(["alpha", "zeta"]);
    expect(diff.changed.map((t) => t.name)).toEqual(["edit", "new-name"]);
    expect(diff.removed).toEqual([{ id: "dt#gone", name: "gone" }]);
  });

  it("counts description and archive changes", () => {
    const diff = diffDesignTokens(
      { "dt#a": { name: "a", value: "p-2" }, "dt#b": { name: "b", value: "p-2", archived: false } },
      {
        "dt#a": { name: "a", value: "p-2", description: "Card padding" },
        "dt#b": { name: "b", value: "p-2", archived: true },
      },
    );
    expect(diff.changed.map((t) => t.id)).toEqual(["dt#a", "dt#b"]);
  });

  it("treats missing maps as empty", () => {
    expect(isDesignTokensDiffEmpty(diffDesignTokens(null, undefined))).toBe(true);
    expect(diffDesignTokens(undefined, { "dt#a": { name: "a", value: "p-2" } }).added).toHaveLength(1);
  });
});
