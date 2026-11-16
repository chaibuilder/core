/**
 * @vitest-environment happy-dom
 */
import { getLibraryBlockMaxDepth } from "./libraries-panel";

const block = (extra: Record<string, unknown> = {}) => ({ id: "b1", name: "Footer 1", group: "footer", ...extra });

describe("getLibraryBlockMaxDepth", () => {
  it("uses the group's entry from the map", () => {
    expect(getLibraryBlockMaxDepth(block(), { footer: 0 })).toBe(0);
  });

  it("matches the group case-insensitively", () => {
    expect(getLibraryBlockMaxDepth(block({ group: "Footer" }), { footer: 0 })).toBe(0);
  });

  it("prefers the block's own maxDepth over its group", () => {
    expect(getLibraryBlockMaxDepth(block({ maxDepth: 2 }), { footer: 0 })).toBe(2);
  });

  it("is undefined when neither block nor group sets one", () => {
    expect(getLibraryBlockMaxDepth(block({ group: "hero" }), { footer: 0 })).toBeUndefined();
  });
});

