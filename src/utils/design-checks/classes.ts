/**
 * Tailwind class parsing for the design checks. Deliberately small: the rules only need to
 * know a class's variants, its utility, and — for colour utilities — which colour it names.
 */

import { CHAI_THEME_COLOR_KEYS } from "~/constants/THEME_COLOR_KEYS";

export type ParsedClass = {
  raw: string;
  /** `md`, `hover`, `dark`, `[&_svg]`… in written order. Empty for the base state. */
  variants: string[];
  /** The utility without variants and without the `!` important marker. */
  utility: string;
};

export const splitClassList = (value: string): string[] => value.split(/\s+/).filter(Boolean);

/** Split `md:hover:bg-primary/90` into variants and utility, ignoring colons inside brackets. */
export function parseClass(raw: string): ParsedClass {
  const variants: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) {
      variants.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  let utility = raw.slice(start);
  if (utility.startsWith("!")) utility = utility.slice(1);
  if (utility.endsWith("!")) utility = utility.slice(0, -1);
  return { raw, variants, utility };
}

export const isBaseState = (parsed: ParsedClass) => parsed.variants.length === 0;

/** Tailwind's default palettes. */
export const CHROMATIC_PALETTES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;
export const NEUTRAL_PALETTES = ["slate", "gray", "zinc", "neutral", "stone"] as const;

/** Theme colour keys are the site's semantic colours. */
const THEME_COLOR_KEY_SET = new Set<string>(CHAI_THEME_COLOR_KEYS);

export type ColorRef =
  | { kind: "semantic"; name: string; opacity: number | null }
  | { kind: "palette"; palette: string; shade: number; neutral: boolean; opacity: number | null }
  | { kind: "absolute"; name: "black" | "white"; opacity: number | null }
  | { kind: "arbitrary"; value: string; opacity: number | null }
  | { kind: "transparent" };

const PALETTE_RE = new RegExp(`^(${[...CHROMATIC_PALETTES, ...NEUTRAL_PALETTES].join("|")})-(50|[1-9]00|950)$`);
const NEUTRAL_SET = new Set<string>(NEUTRAL_PALETTES);

/** `primary/90` → { value: "primary", opacity: 90 }. */
function splitOpacity(value: string): { value: string; opacity: number | null } {
  const match = /^(.*?)\/(\d{1,3})$/.exec(value);
  return match ? { value: match[1], opacity: Number(match[2]) } : { value, opacity: null };
}

/**
 * The colour a colour utility names, or null when the utility is not a colour (`text-lg`,
 * `bg-cover`, `border-2`…). `prefix` is the utility family: `bg`, `text`, `border`, `from`…
 */
export function colorOf(prefix: string, utility: string): ColorRef | null {
  if (!utility.startsWith(`${prefix}-`)) return null;
  const { value, opacity } = splitOpacity(utility.slice(prefix.length + 1));
  if (value === "transparent") return { kind: "transparent" };
  if (value === "black" || value === "white") return { kind: "absolute", name: value, opacity };
  if (THEME_COLOR_KEY_SET.has(value)) return { kind: "semantic", name: value, opacity };
  const palette = PALETTE_RE.exec(value);
  if (palette) {
    return {
      kind: "palette",
      palette: palette[1],
      shade: Number(palette[2]),
      neutral: NEUTRAL_SET.has(palette[1]),
      opacity,
    };
  }
  const arbitrary = /^\[(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([^\]]*\))\]$/.exec(value);
  if (arbitrary) return { kind: "arbitrary", value: arbitrary[1], opacity };
  return null;
}

/** A gradient background (`bg-gradient-to-r`, `bg-linear-to-r`, `bg-radial`, `bg-conic`…). */
export const isGradientUtility = (utility: string) =>
  /^bg-(gradient-to-|linear-|radial|conic)/.test(utility) || /^bg-\[(linear|radial|conic)-gradient/.test(utility);

/**
 * A border width utility: `border`, `border-2`, `border-t`, `border-x-4`, `border-[3px]` — not
 * `border-0` or a colour, arbitrary ones (`border-[#e5e7eb]`, `border-[color:var(--x)]`) included.
 */
export const isBorderWidthUtility = (utility: string) =>
  /^border(-[xytblrse])?(-(?:[1-9]\d*|\[(?!#|rgba?\(|hsla?\(|oklch\(|oklab\(|color:)[^\]]+\]))?$/.test(utility);

export const isShadowUtility = (utility: string) => /^shadow(-(2xs|xs|sm|md|lg|xl|2xl))?$/.test(utility);

/** `rounded`, `rounded-lg`, `rounded-t-xl`… but not `rounded-none` or `rounded-full` (pills, avatars). */
export const isRoundedUtility = (utility: string) =>
  /^rounded(-[a-z]{1,2})?(-(xs|sm|md|lg|xl|2xl|3xl|4xl|\[[^\]]+\]))?$/.test(utility) && !/-(none|full)$/.test(utility);

if (import.meta.vitest) {
  describe("parseClass", () => {
    it("separates variants from the utility, respecting brackets", () => {
      expect(parseClass("md:hover:bg-primary/90")).toEqual({
        raw: "md:hover:bg-primary/90",
        variants: ["md", "hover"],
        utility: "bg-primary/90",
      });
      expect(parseClass("[&_svg]:size-4").variants).toEqual(["[&_svg]"]);
      expect(parseClass("bg-[url(https://x.test/a.png)]").utility).toBe("bg-[url(https://x.test/a.png)]");
      expect(parseClass("!text-red-500").utility).toBe("text-red-500");
      expect(parseClass("text-red-500!").utility).toBe("text-red-500");
    });
  });

  describe("colorOf", () => {
    it("recognises semantic, palette, absolute and arbitrary colours", () => {
      expect(colorOf("bg", "bg-primary/90")).toEqual({ kind: "semantic", name: "primary", opacity: 90 });
      expect(colorOf("text", "text-gray-500")).toMatchObject({ kind: "palette", palette: "gray", neutral: true });
      expect(colorOf("bg", "bg-white/10")).toEqual({ kind: "absolute", name: "white", opacity: 10 });
      expect(colorOf("bg", "bg-[#ff0000]")).toMatchObject({ kind: "arbitrary", value: "#ff0000" });
      expect(colorOf("bg", "bg-transparent")).toEqual({ kind: "transparent" });
    });

    it("ignores utilities that are not colours", () => {
      for (const utility of ["text-lg", "text-center", "bg-cover", "bg-gradient-to-r", "text-[14px]", "border-2"]) {
        const prefix = utility.split("-")[0];
        expect(colorOf(prefix, utility), utility).toBeNull();
      }
    });
  });

  describe("shape helpers", () => {
    it("classifies borders, shadows and radius", () => {
      expect(["border", "border-2", "border-t", "border-x-4"].every(isBorderWidthUtility)).toBe(true);
      expect(["border-0", "border-border", "border-primary"].some(isBorderWidthUtility)).toBe(false);
      expect(isBorderWidthUtility("border-[3px]")).toBe(true);
      expect(["border-[#e5e7eb]", "border-t-[rgb(0,0,0)]", "border-[color:var(--x)]"].some(isBorderWidthUtility)).toBe(
        false,
      );
      expect(["shadow", "shadow-lg"].every(isShadowUtility)).toBe(true);
      expect(isShadowUtility("shadow-none")).toBe(false);
      expect(["rounded", "rounded-lg", "rounded-t-xl"].every(isRoundedUtility)).toBe(true);
      expect(["rounded-full", "rounded-none"].some(isRoundedUtility)).toBe(false);
    });
  });
}
