import { z } from "zod";
import { CHAI_THEME_COLOR_KEYS } from "~/constants/THEME_COLOR_KEYS";
import { DEFAULT_APP_THEME } from "~/drizzle/seed/defaults";
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";

/**
 * A partial site-theme update: validation and merge. Pure (no DB, no server guard), so tool
 * metas can reuse the schema.
 */

/** Letters, digits, spaces and `._+-`: every Google font name fits, and nothing that escapes CSS. */
export const THEME_FONT_FAMILY_RE = /^[\p{L}\p{N} ._+-]{1,100}$/u;
export const THEME_RADIUS_RE = /^\d+(\.\d+)?(px|rem)$/;
export const THEME_HEX_RE = /^#[0-9a-fA-F]{6}$/;

const hex = z.string().regex(THEME_HEX_RE, "must be a #RRGGBB hex colour");
const fontFamily = z.string().trim().regex(THEME_FONT_FAMILY_RE, "is not a font family name");

const colorPair = z.tuple([hex, hex]);
// Explicit optional properties instead of z.partialRecord so AI SDK's zodSchema()
// emits usable per-key JSON Schema properties rather than `additionalProperties: false`
// with no properties (which forces strict models to send only `{}`).
const themeColorsPatchShape = Object.fromEntries(
  CHAI_THEME_COLOR_KEYS.map((key) => [key, colorPair.optional()]),
) as Record<(typeof CHAI_THEME_COLOR_KEYS)[number], z.ZodOptional<typeof colorPair>>;

export const chaiThemePatchShape = {
  fontFamily: z
    .strictObject({
      heading: fontFamily.optional().describe("Font for h1–h6 (font-heading)."),
      body: fontFamily.optional().describe("Font for body text (font-body)."),
    })
    .optional()
    .describe("Font families by exact name."),
  borderRadius: z
    .string()
    .regex(THEME_RADIUS_RE, "must be a length in px or rem, e.g. 8px")
    .optional()
    .describe("Base radius in px or rem, e.g. 8px; rounded-lg uses it, rounded-md and rounded-sm step down."),
  colors: z
    .strictObject(themeColorsPatchShape)
    .optional()
    .describe(
      "Colours to change, keyed by theme role (background, foreground, primary, primary-foreground, muted, muted-foreground, card, border…), each a [light, dark] pair of #RRGGBB values.",
    ),
};
export const chaiThemePatchSchema = z.strictObject(chaiThemePatchShape);
export type ChaiThemePatch = z.infer<typeof chaiThemePatchSchema>;

/**
 * A stored theme with its gaps filled from the seeded default, so a patch can never leave a
 * site with half a theme (a row created before themes were seeded holds `{}`).
 */
export function completeTheme(current: Partial<ChaiTheme> | null | undefined): ChaiTheme {
  const stored = current ?? {};
  return {
    ...DEFAULT_APP_THEME,
    ...stored,
    fontFamily: { ...DEFAULT_APP_THEME.fontFamily, ...stored.fontFamily },
    colors: { ...DEFAULT_APP_THEME.colors, ...stored.colors },
  } as ChaiTheme;
}

const samePair = (a: readonly string[] | undefined, b: readonly string[]) =>
  !!a && a[0]?.toLowerCase() === b[0].toLowerCase() && a[1]?.toLowerCase() === b[1].toLowerCase();

/** The theme after a patch, and the keys it changed (`fontFamily.heading`, `colors.primary`…). */
export function applyThemePatch(
  current: Partial<ChaiTheme> | null | undefined,
  patch: ChaiThemePatch,
): { next: ChaiTheme; changed: string[] } {
  const base = completeTheme(current);
  const changed: string[] = [];
  const next: ChaiTheme = { ...base, fontFamily: { ...base.fontFamily }, colors: { ...base.colors } };

  for (const key of ["heading", "body"] as const) {
    const value = patch.fontFamily?.[key];
    if (value && value !== base.fontFamily[key]) {
      next.fontFamily[key] = value;
      changed.push(`fontFamily.${key}`);
    }
  }
  if (patch.borderRadius && patch.borderRadius !== base.borderRadius) {
    next.borderRadius = patch.borderRadius;
    changed.push("borderRadius");
  }
  const colors = next.colors as Record<string, [string, string]>;
  for (const [key, pair] of Object.entries(patch.colors ?? {})) {
    if (!pair || samePair(colors[key], pair)) continue;
    colors[key] = [pair[0], pair[1]];
    changed.push(`colors.${key}`);
  }
  return { next, changed };
}
