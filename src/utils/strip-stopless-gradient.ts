// A gradient *direction* utility (`bg-gradient-to-r`, `md:bg-gradient-to-l`,
// `hover:bg-gradient-to-br`, …) only paints once color-stop utilities
// (`from-*` / `via-*` / `to-*`) populate the `--tw-gradient-*` custom properties.
// A direction with no stops in scope renders `background-image: none` — it is
// completely inert.
//
// It is not inert to the class-merge engine, though: `cnfast` (this stack's
// `twMerge`) groups `bg-gradient-to-*` in the same conflict bucket as
// `bg-{color}`, so a stopless direction *evicts* a solid `bg-primary` /
// `bg-secondary` from the merge and leaves the element with no background at all
// — e.g. white `text-primary-foreground` on nothing (the invisible car-card
// "Voir les détails" CTA). `tailwind-merge` keeps gradient-image and
// background-color in separate groups, which is why this only surfaced after the
// cnfast switch.
//
// Removing a stopless direction is always safe: it only ever drops a
// provably-transparent no-op, and never a direction that has stops backing it.
// Base (unprefixed) stops cascade into every variant/breakpoint through the
// shared `--tw-gradient-*` properties, so when base stops exist no direction is
// stopless; otherwise a direction is kept only when a stop with its own exact
// variant prefix is present (e.g. `md:bg-gradient-to-l` backed by `md:from-…`).
const GRADIENT_DIRECTION = /^((?:[\w-]+:)*)bg-gradient-to-[a-z]+$/;
const GRADIENT_STOP = /^((?:[\w-]+:)*)(?:from|via|to)-\S+$/;

/**
 * Remove gradient direction classes that have no color stops backing them, so a
 * solid `bg-*` in the same class string is not evicted by the class merge. Pure
 * and deterministic (safe to memoize). Returns the input unchanged (same
 * reference) when there is nothing to strip.
 */
export const stripStoplessGradientClasses = (className: string): string => {
  // Fast path: no gradient direction can exist without this substring.
  if (!className || !className.includes("bg-gradient")) return className;

  const tokens = className.split(/\s+/).filter(Boolean);

  const stopPrefixes = new Set<string>();
  for (const token of tokens) {
    const match = GRADIENT_STOP.exec(token);
    if (match) stopPrefixes.add(match[1]);
  }
  const hasBaseStop = stopPrefixes.has("");

  let changed = false;
  const kept = tokens.filter((token) => {
    const match = GRADIENT_DIRECTION.exec(token);
    if (match && !hasBaseStop && !stopPrefixes.has(match[1])) {
      changed = true;
      return false;
    }
    return true;
  });

  return changed ? kept.join(" ") : className;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  describe("stripStoplessGradientClasses", () => {
    it("strips a stopless gradient direction so the solid bg survives the merge", () => {
      expect(stripStoplessGradientClasses("bg-primary bg-gradient-to-r bg-[length:200%_200%]")).toBe(
        "bg-primary bg-[length:200%_200%]",
      );
    });

    it("strips variant-prefixed stopless directions (base + hover)", () => {
      expect(stripStoplessGradientClasses("bg-secondary bg-gradient-to-r hover:bg-gradient-to-l")).toBe("bg-secondary");
    });

    it("keeps a genuine gradient that defines base color stops (returns input unchanged)", () => {
      const input = "bg-gradient-to-r from-red-500 to-blue-500";
      expect(stripStoplessGradientClasses(input)).toBe(input);
    });

    it("keeps a hover direction backed by cascading base stops", () => {
      const input = "from-red-500 to-blue-500 hover:bg-gradient-to-l";
      expect(stripStoplessGradientClasses(input)).toBe(input);
    });

    it("strips only the stopless base direction when a responsive layer has its own stops", () => {
      expect(
        stripStoplessGradientClasses("bg-gradient-to-r md:bg-gradient-to-l md:from-red-500 md:to-blue-500"),
      ).toBe("md:bg-gradient-to-l md:from-red-500 md:to-blue-500");
    });

    it("keeps a responsive direction backed by a same-prefix stop", () => {
      const input = "md:bg-gradient-to-l md:from-red-500 md:to-blue-500";
      expect(stripStoplessGradientClasses(input)).toBe(input);
    });

    it("no-ops when there is no gradient direction", () => {
      const input = "bg-secondary hover:bg-secondary/80 h-12";
      expect(stripStoplessGradientClasses(input)).toBe(input);
    });

    it("handles an empty string", () => {
      expect(stripStoplessGradientClasses("")).toBe("");
    });
  });
}
