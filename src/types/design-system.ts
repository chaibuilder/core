/**
 * The site design system: ChaiBuilder's equivalent of a DESIGN.md.
 *
 * Stored as `apps.ai.designSystem` (next to the existing AI context keys) and, per page,
 * `app_pages.ai.designBrief`. The machine-readable half of a design system is NOT here:
 * the theme (fonts, palette, radius) and the design tokens are the source of truth for
 * values, so this object only carries the written rules that tie them together.
 *
 * The feature is opt-in at two levels, and nothing is inferred:
 * - the deployment turns it on (`features.designSystem.enabled`, set by the MCP plugin's
 *   `designSystem` option);
 * - a site turns it on (`ChaiDesignSystem.enabled`, set only by an explicit save).
 * Until both are on, every existing flow behaves exactly as before.
 *
 * Types and constants only: this module is part of the zod-free `./types` bundle. The
 * validation schema lives in `~/server/chai-actions/ai/design-system-schema`.
 */

/** Who the surface serves, which decides how expressive it may be. */
export const CHAI_VISITOR_MODES = ["persuade", "operate", "read", "experience"] as const;
export type ChaiVisitorMode = (typeof CHAI_VISITOR_MODES)[number];

/** How much of the surface colour carries, from one accent to colour as the surface itself. */
export const CHAI_COLOR_STRATEGIES = ["restrained", "committed", "full-palette", "drenched"] as const;
export type ChaiColorStrategy = (typeof CHAI_COLOR_STRATEGIES)[number];

/** The eight written sections, in the canonical DESIGN.md order. */
export const CHAI_DESIGN_SYSTEM_SECTIONS = [
  "overview",
  "colors",
  "typography",
  "layout",
  "elevation",
  "shapes",
  "components",
  "dosAndDonts",
] as const;
export type ChaiDesignSystemSection = (typeof CHAI_DESIGN_SYSTEM_SECTIONS)[number];

/** Display titles for the sections, in the same order. */
export const CHAI_DESIGN_SYSTEM_SECTION_TITLES: Record<ChaiDesignSystemSection, string> = {
  overview: "Overview",
  colors: "Colors",
  typography: "Typography",
  layout: "Layout",
  elevation: "Elevation & Depth",
  shapes: "Shapes",
  components: "Components",
  dosAndDonts: "Do's and Don'ts",
};

/** Key of the site design system inside `apps.ai`. */
export const CHAI_DESIGN_SYSTEM_KEY = "designSystem";
/** Key of the page design brief inside `app_pages.ai`. */
export const CHAI_PAGE_DESIGN_BRIEF_KEY = "designBrief";

export const CHAI_DESIGN_SYSTEM_VERSION = 1;

export type ChaiDesignSystem = {
  version: typeof CHAI_DESIGN_SYSTEM_VERSION;
  /** Explicit per-site switch. False until the user confirms; nothing is enforced while false. */
  enabled: boolean;
  /** One line naming the creative direction. */
  northStar: string;
  /** Default visitor mode; a page brief overrides it for that page. */
  mode: ChaiVisitorMode;
  colorStrategy?: ChaiColorStrategy;
  /** Markdown. An empty string means the section has not been written yet. */
  overview: string;
  colors: string;
  typography: string;
  layout: string;
  elevation: string;
  shapes: string;
  components: string;
  dosAndDonts: string;
  /** Looks this site deliberately refuses (the category default, obvious AI looks…). */
  antiReferences?: string[];
  /** ISO timestamp of the last save. */
  updatedAt: string;
  updatedBy?: string;
  source?: "mcp" | "builder";
};

/** The design brief of one page (a "surface"). Stored on the primary page row. */
export type ChaiPageDesignBrief = {
  mode: ChaiVisitorMode;
  /** The idea this page owns and the category default it refuses. */
  thesis: string;
  /** What the visitor understands, believes and does, in order. */
  story?: string;
  /** Composition of the first viewport: what leads, where the primary action sits. */
  firstViewport?: string;
  notes?: string;
  updatedAt: string;
};

export type ChaiDesignChecksMode = "off" | "warn" | "strict";

/** Deployment-level switch, exposed to the builder and the MCP as `features.designSystem`. */
export type ChaiDesignSystemFeature = {
  enabled: boolean;
  /** What block writes do with design-check findings on sites whose design system is enabled. */
  designChecks: ChaiDesignChecksMode;
};

export type ChaiDesignSystemStatus = "not_set_up" | "disabled" | "partial" | "ready";
