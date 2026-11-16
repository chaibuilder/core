import { z } from "zod";
import {
  CHAI_COLOR_STRATEGIES,
  CHAI_DESIGN_SYSTEM_SECTIONS,
  CHAI_DESIGN_SYSTEM_VERSION,
  CHAI_VISITOR_MODES,
  type ChaiDesignSystem,
  type ChaiDesignSystemFeature,
  type ChaiDesignSystemSection,
  type ChaiDesignSystemStatus,
  type ChaiPageDesignBrief,
} from "~/types/design-system";

/**
 * Validation and merge rules for the site design system (`apps.ai.designSystem`) and the
 * page design brief (`app_pages.ai.designBrief`).
 *
 * Pure (zod only, no DB, no server guard) so tool metas can build their input schemas from
 * the same limits, and the builder can reuse it when it gets a design-system editor.
 */

export const CHAI_DESIGN_SYSTEM_LIMITS = {
  northStar: 300,
  sections: {
    overview: 1500,
    colors: 2000,
    typography: 2000,
    layout: 2000,
    elevation: 1500,
    shapes: 1000,
    components: 2000,
    dosAndDonts: 2500,
  } satisfies Record<ChaiDesignSystemSection, number>,
  /** All written text together (north star, sections, anti-references). */
  total: 12_000,
  antiReferences: { count: 12, length: 120 },
  brief: { thesis: 400, story: 800, firstViewport: 600, notes: 800 },
} as const;

const L = CHAI_DESIGN_SYSTEM_LIMITS;

const sectionField = (section: ChaiDesignSystemSection) => z.string().max(L.sections[section]);

const antiReferencesField = z.array(z.string().trim().min(1).max(L.antiReferences.length)).max(L.antiReferences.count);

/** Total written length, the figure `CHAI_DESIGN_SYSTEM_LIMITS.total` caps. */
export function designSystemTextLength(
  ds: Pick<ChaiDesignSystem, "northStar" | ChaiDesignSystemSection> & {
    antiReferences?: string[];
  },
): number {
  return (
    ds.northStar.length +
    CHAI_DESIGN_SYSTEM_SECTIONS.reduce((sum, section) => sum + (ds[section]?.length ?? 0), 0) +
    (ds.antiReferences ?? []).reduce((sum, item) => sum + item.length, 0)
  );
}

export const chaiDesignSystemSchema = z
  .strictObject({
    version: z.literal(CHAI_DESIGN_SYSTEM_VERSION),
    enabled: z.boolean(),
    northStar: z.string().trim().min(1).max(L.northStar),
    mode: z.enum(CHAI_VISITOR_MODES),
    colorStrategy: z.enum(CHAI_COLOR_STRATEGIES).optional(),
    overview: sectionField("overview"),
    colors: sectionField("colors"),
    typography: sectionField("typography"),
    layout: sectionField("layout"),
    elevation: sectionField("elevation"),
    shapes: sectionField("shapes"),
    components: sectionField("components"),
    dosAndDonts: sectionField("dosAndDonts"),
    antiReferences: antiReferencesField.optional(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string().max(200).optional(),
    source: z.enum(["mcp", "builder"]).optional(),
  })
  .superRefine((ds, ctx) => {
    const length = designSystemTextLength(ds);
    if (length > L.total) {
      ctx.addIssue({
        code: "custom",
        message: `The design system is ${length} characters; the limit is ${L.total}. Tighten the longest sections.`,
      });
    }
  });

/**
 * A partial update. `null` clears an optional field or empties a section; an omitted
 * field is left as it is.
 */
export const chaiDesignSystemPatchShape = {
  enabled: z.boolean().optional(),
  northStar: z.string().trim().min(1).max(L.northStar).optional(),
  mode: z.enum(CHAI_VISITOR_MODES).optional(),
  colorStrategy: z.enum(CHAI_COLOR_STRATEGIES).nullable().optional(),
  overview: sectionField("overview").nullable().optional(),
  colors: sectionField("colors").nullable().optional(),
  typography: sectionField("typography").nullable().optional(),
  layout: sectionField("layout").nullable().optional(),
  elevation: sectionField("elevation").nullable().optional(),
  shapes: sectionField("shapes").nullable().optional(),
  components: sectionField("components").nullable().optional(),
  dosAndDonts: sectionField("dosAndDonts").nullable().optional(),
  antiReferences: antiReferencesField.nullable().optional(),
};
export const chaiDesignSystemPatchSchema = z.strictObject(chaiDesignSystemPatchShape);
export type ChaiDesignSystemPatch = z.infer<typeof chaiDesignSystemPatchSchema>;

export const chaiPageDesignBriefInputShape = {
  mode: z.enum(CHAI_VISITOR_MODES),
  thesis: z.string().trim().min(1).max(L.brief.thesis),
  story: z.string().max(L.brief.story).optional(),
  firstViewport: z.string().max(L.brief.firstViewport).optional(),
  notes: z.string().max(L.brief.notes).optional(),
};
export const chaiPageDesignBriefSchema = z.strictObject({
  ...chaiPageDesignBriefInputShape,
  updatedAt: z.iso.datetime(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Read a stored design system leniently: a value written by an older or newer shape still
 * reads as long as it has the identifying fields, with missing sections as "". Anything
 * else reads as "no design system", never as an error — a malformed row must not break
 * the tools that only want to know whether rules apply.
 */
export function readChaiDesignSystem(value: unknown): ChaiDesignSystem | null {
  if (!isRecord(value)) return null;
  if (typeof value.northStar !== "string" || !value.northStar.trim()) return null;
  if (!CHAI_VISITOR_MODES.includes(value.mode as never)) return null;

  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : "");
  const sections = Object.fromEntries(CHAI_DESIGN_SYSTEM_SECTIONS.map((section) => [section, text(section)])) as Record<
    ChaiDesignSystemSection,
    string
  >;
  const antiReferences = Array.isArray(value.antiReferences)
    ? value.antiReferences.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : undefined;

  return {
    version: CHAI_DESIGN_SYSTEM_VERSION,
    enabled: value.enabled === true,
    northStar: value.northStar,
    mode: value.mode as ChaiDesignSystem["mode"],
    ...(CHAI_COLOR_STRATEGIES.includes(value.colorStrategy as never)
      ? { colorStrategy: value.colorStrategy as ChaiDesignSystem["colorStrategy"] }
      : {}),
    ...sections,
    ...(antiReferences?.length ? { antiReferences } : {}),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    ...(typeof value.updatedBy === "string" ? { updatedBy: value.updatedBy } : {}),
    ...(value.source === "mcp" || value.source === "builder" ? { source: value.source } : {}),
  };
}

/** Same leniency for the page brief. */
export function readChaiPageDesignBrief(value: unknown): ChaiPageDesignBrief | null {
  if (!isRecord(value)) return null;
  if (typeof value.thesis !== "string" || !value.thesis.trim()) return null;
  if (!CHAI_VISITOR_MODES.includes(value.mode as never)) return null;
  const optional = (key: "story" | "firstViewport" | "notes") =>
    typeof value[key] === "string" && (value[key] as string).trim() ? { [key]: value[key] as string } : {};
  return {
    mode: value.mode as ChaiPageDesignBrief["mode"],
    thesis: value.thesis,
    ...optional("story"),
    ...optional("firstViewport"),
    ...optional("notes"),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function missingDesignSystemSections(ds: ChaiDesignSystem | null): ChaiDesignSystemSection[] {
  if (!ds) return [...CHAI_DESIGN_SYSTEM_SECTIONS];
  return CHAI_DESIGN_SYSTEM_SECTIONS.filter((section) => !ds[section].trim());
}

export function designSystemStatus(ds: ChaiDesignSystem | null): ChaiDesignSystemStatus {
  if (!ds) return "not_set_up";
  if (!ds.enabled) return "disabled";
  return missingDesignSystemSections(ds).length > 0 ? "partial" : "ready";
}

/**
 * THE predicate every design rule, check and instruction keys off: the deployment turned
 * the feature on AND this site enabled its design system. Nothing is inferred from content.
 */
export function isDesignSystemActive(
  feature: Pick<ChaiDesignSystemFeature, "enabled"> | null | undefined,
  ds: Pick<ChaiDesignSystem, "enabled"> | null | undefined,
): boolean {
  return feature?.enabled === true && ds?.enabled === true;
}

export type MergeChaiDesignSystemResult = { ok: true; next: ChaiDesignSystem } | { ok: false; message: string };

/**
 * Apply a patch to the stored design system (or start a new one), then validate the result.
 * A new design system needs a north star and a mode, and starts disabled unless the patch
 * enables it.
 */
export function mergeChaiDesignSystem(
  current: ChaiDesignSystem | null,
  patch: ChaiDesignSystemPatch,
  options: { replace?: boolean; updatedBy?: string; source: "mcp" | "builder"; now?: Date },
): MergeChaiDesignSystemResult {
  const base = options.replace ? null : current;
  const northStar = patch.northStar ?? base?.northStar;
  const mode = patch.mode ?? base?.mode;
  if (!northStar || !mode) {
    return {
      ok: false,
      message:
        "A new design system needs northStar and mode. Run the setup interview first, then save the direction the user approved.",
    };
  }

  const sections = Object.fromEntries(
    CHAI_DESIGN_SYSTEM_SECTIONS.map((section) => {
      const value = patch[section];
      return [section, value === null ? "" : (value ?? base?.[section] ?? "")];
    }),
  ) as Record<ChaiDesignSystemSection, string>;

  const colorStrategy = patch.colorStrategy === null ? undefined : (patch.colorStrategy ?? base?.colorStrategy);
  const antiReferences = patch.antiReferences === null ? undefined : (patch.antiReferences ?? base?.antiReferences);

  const next: ChaiDesignSystem = {
    version: CHAI_DESIGN_SYSTEM_VERSION,
    enabled: patch.enabled ?? base?.enabled ?? false,
    northStar,
    mode,
    ...(colorStrategy ? { colorStrategy } : {}),
    ...sections,
    ...(antiReferences?.length ? { antiReferences } : {}),
    updatedAt: (options.now ?? new Date()).toISOString(),
    ...(options.updatedBy ? { updatedBy: options.updatedBy } : {}),
    source: options.source,
  };

  const parsed = chaiDesignSystemSchema.safeParse(next);
  if (!parsed.success) {
    return { ok: false, message: formatZodIssues(parsed.error) };
  }
  return { ok: true, next: parsed.data as ChaiDesignSystem };
}

/** "field: message; field: message" — short enough to hand back to an agent. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
