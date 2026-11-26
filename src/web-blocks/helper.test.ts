import { addForcedClasses, getAriaLabel, mergeChaiStyles } from "./helper";

describe("getAriaLabel", () => {
  it("returns the trimmed author-set label", () => {
    expect(getAriaLabel({ "aria-label": "  Fermer  " })).toBe("Fermer");
  });

  it('returns undefined - never "" - when there is nothing usable', () => {
    // React renders aria-label="" for the empty string, which strips the
    // accessible name outright. Returning undefined lets React drop the
    // attribute, so `aria-label={getAriaLabel(x)}` is safe on its own.
    expect(getAriaLabel({ "aria-label": "" })).toBeUndefined();
    expect(getAriaLabel({ "aria-label": "   " })).toBeUndefined();
    expect(getAriaLabel({})).toBeUndefined();
    expect(getAriaLabel(undefined)).toBeUndefined();
    expect(getAriaLabel(null)).toBeUndefined();
  });

  it("ignores non-string values", () => {
    expect(getAriaLabel({ "aria-label": 42 })).toBeUndefined();
    expect(getAriaLabel({ "aria-label": true })).toBeUndefined();
    expect(getAriaLabel({ "aria-label": {} })).toBeUndefined();
  });
});

describe("addForcedClasses", () => {
  it("preserves custom HTML attributes while merging classes", () => {
    const result = addForcedClasses(
      {
        id: "hero-input",
        "data-track": "search-input",
        "aria-label": "Search homes",
        className: "px-4 text-sm",
      },
      "focus-visible:outline-none",
    );

    expect(result).toEqual({
      id: "hero-input",
      "data-track": "search-input",
      "aria-label": "Search homes",
      className: "px-4 text-sm focus-visible:outline-none",
    });
  });

  it("handles undefined styles safely", () => {
    expect(addForcedClasses(undefined, "flex", "items-center")).toEqual({
      className: "flex items-center",
    });
    expect(addForcedClasses(undefined)).toEqual({});
  });

  it("accepts conditional ClassValue inputs and resolves Tailwind conflicts", () => {
    const isActive = true;
    const isHidden = false;
    const result = addForcedClasses(
      { className: "px-2 text-muted-foreground", "data-slot": "tab" },
      isActive && "px-4 text-foreground",
      isHidden && "hidden",
      undefined,
      null,
    );

    expect(result).toEqual({
      "data-slot": "tab",
      className: "px-4 text-foreground",
    });
  });

  it("omits className when the merged class string is empty", () => {
    const result = addForcedClasses({ className: "", "data-id": "empty" }, "", false, undefined);
    expect(result).toEqual({ "data-id": "empty" });
    expect("className" in result).toBe(false);
  });

  it("does not mutate the input styles object", () => {
    const original = { className: "p-2", "data-k": "v" };
    const result = addForcedClasses(original, "p-4");
    expect(original).toEqual({ className: "p-2", "data-k": "v" });
    expect(result).toEqual({ className: "p-4", "data-k": "v" });
  });
});

describe("mergeChaiStyles", () => {
  it("merges custom HTML attributes with the first style winning, and Tailwind classes with later precedence", () => {
    const base = {
      id: "tab-1",
      "data-role": "tab",
      "data-state": "inactive",
      className: "px-3 text-muted-foreground",
    };
    const active = {
      "data-state": "active",
      "aria-current": "page",
      className: "text-foreground font-semibold",
    };

    expect(mergeChaiStyles(base, active)).toEqual({
      id: "tab-1",
      "data-role": "tab",
      "data-state": "inactive",
      "aria-current": "page",
      className: "px-3 text-foreground font-semibold",
    });
  });

  it("skips false, null, and undefined entries", () => {
    const base = { "data-tab": "buy", className: "px-3" };
    expect(mergeChaiStyles(base, false, null, undefined)).toEqual({
      "data-tab": "buy",
      className: "px-3",
    });
  });

  it("omits className when all merged entries have no classes", () => {
    const result = mergeChaiStyles({ id: "a", className: "" }, { "data-x": "1" });
    expect(result).toEqual({ id: "a", "data-x": "1" });
    expect("className" in result).toBe(false);
  });

  it("returns an empty object when called with no truthy styles", () => {
    expect(mergeChaiStyles(undefined, false, null)).toEqual({});
  });
});
