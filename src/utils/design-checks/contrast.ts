/** WCAG 2 contrast for hex colours (`#RGB` or `#RRGGBB`, `#` optional). */

export function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((d) => d + d)
          .join("")
      : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two hex colours (1–21), or null when either is not a hex colour. */
export function hexContrastRatio(a: string, b: string): number | null {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Body text needs 4.5:1; large text and UI components 3:1. */
export const CONTRAST_BODY = 4.5;
export const CONTRAST_LARGE = 3;

if (import.meta.vitest) {
  describe("hexContrastRatio", () => {
    it("computes known ratios", () => {
      expect(hexContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
      expect(hexContrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
      // Tailwind blue-600 on white.
      expect(hexContrastRatio("#2563EB", "#FFFFFF")).toBeCloseTo(5.17, 1);
    });

    it("is symmetric and rejects non-hex values", () => {
      expect(hexContrastRatio("#2563EB", "#FFFFFF")).toBe(hexContrastRatio("#FFFFFF", "#2563EB"));
      expect(hexContrastRatio("hsl(0 0% 0%)", "#fff")).toBeNull();
      expect(hexContrastRatio("#12345", "#fff")).toBeNull();
    });
  });
}
