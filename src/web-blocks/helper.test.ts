import { getAriaLabel } from "./helper";

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
