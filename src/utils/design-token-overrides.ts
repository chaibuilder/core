import { twMerge } from "cnfast";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import type { ChaiDesignTokens } from "~/types/types";

/**
 * Restyling a built-in design token without breaking it: new classes merge over the built-in
 * (and any current override), then the classes that carry the component's behaviour — layout,
 * focus, disabled, pointer and state handling — are re-applied last, so a restyle can change
 * how a button looks but never how it works.
 *
 * Shared by the AI theme generator and the design-token update action.
 */

const PROTECTED_CLASS_PREFIXES = [
  "focus:",
  "focus-visible:",
  "disabled:",
  "peer-disabled:",
  "aria-",
  "data-[",
  "[&",
] as const;

const PROTECTED_BASE_CLASS_PATTERNS = [
  /^(?:inline|inline-flex|flex|grid|block|hidden)$/,
  /^(?:relative|absolute|fixed|sticky)$/,
  /^(?:whitespace|overflow|pointer-events|cursor|shrink|grow|items|justify|translate|top|right|bottom|left)-/,
] as const;

export const isProtectedClass = (className: string): boolean =>
  PROTECTED_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix)) ||
  PROTECTED_BASE_CLASS_PATTERNS.some((pattern) => pattern.test(className));

/** Same rule as the builder's token editor (`design-token-utils.ts`). */
export const DESIGN_TOKEN_NAME_RE = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/;
export const DESIGN_TOKEN_NAME_MAX = 75;
export const DESIGN_TOKEN_VALUE_MAX = 1000;

/** Why a class list cannot be a token value, or null when it can. */
export function tokenClassesError(classes: string): string | null {
  const trimmed = classes.trim();
  if (!trimmed) return "is empty";
  if (trimmed.length > DESIGN_TOKEN_VALUE_MAX) return `is longer than ${DESIGN_TOKEN_VALUE_MAX} characters`;
  if (trimmed.includes("dt#")) return "references another token (dt#…); use Tailwind classes only";
  if (/[{};<>\u0000-\u001f]/.test(trimmed)) return "contains characters that are not Tailwind classes";
  return null;
}

export const isBuiltInDesignToken = (id: string): boolean => id in CHAI_BUILT_IN_DESIGN_TOKENS;

/**
 * The value of a built-in token after applying `classes`: built-in, then the current override
 * (unless `reset`), then the new classes, then the built-in's protected classes.
 */
export function mergeBuiltInTokenClasses(
  id: string,
  classes: string,
  current?: ChaiDesignTokens[string],
  options: { reset?: boolean } = {},
): string {
  const builtIn = CHAI_BUILT_IN_DESIGN_TOKENS[id];
  if (!builtIn) throw new Error(`${id} is not a built-in design token`);
  const merged = twMerge(builtIn.value, options.reset ? "" : current?.value || "", classes.trim());
  const protectedClasses = builtIn.value.split(/\s+/).filter(isProtectedClass);
  return twMerge(merged, protectedClasses.join(" "));
}

if (import.meta.vitest) {
  describe("mergeBuiltInTokenClasses", () => {
    it("restyles a built-in while keeping its behaviour classes", () => {
      const value = mergeBuiltInTokenClasses("dt#btn", "rounded-full block focus-visible:ring-4");
      const classes = value.split(/\s+/);
      expect(classes).toContain("rounded-full");
      expect(classes).toContain("inline-flex");
      expect(classes).not.toContain("block");
      expect(classes).toContain("focus-visible:ring-1");
      expect(classes).not.toContain("focus-visible:ring-4");
    });

    it("builds on the current override unless reset", () => {
      const current = { ...CHAI_BUILT_IN_DESIGN_TOKENS["dt#card"], value: "rounded-xl border bg-card shadow-lg" };
      expect(mergeBuiltInTokenClasses("dt#card", "p-8", current)).toContain("shadow-lg");
      expect(mergeBuiltInTokenClasses("dt#card", "p-8", current, { reset: true })).not.toContain("shadow-lg");
    });
  });

  describe("tokenClassesError", () => {
    it("accepts Tailwind classes and rejects everything else", () => {
      expect(tokenClassesError("rounded-full px-6 hover:bg-primary/90")).toBeNull();
      expect(tokenClassesError("  ")).toMatch(/empty/);
      expect(tokenClassesError("dt#btn px-2")).toMatch(/another token/);
      expect(tokenClassesError("x;}body{color:red")).toMatch(/not Tailwind/);
    });
  });
}
