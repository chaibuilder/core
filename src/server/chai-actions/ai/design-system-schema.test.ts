import { describe, expect, it } from "vitest";
import { CHAI_DESIGN_SYSTEM_SECTIONS, type ChaiDesignSystem } from "~/types/design-system";
import {
  CHAI_DESIGN_SYSTEM_LIMITS,
  chaiDesignSystemSchema,
  chaiPageDesignBriefSchema,
  designSystemStatus,
  isDesignSystemActive,
  mergeChaiDesignSystem,
  missingDesignSystemSections,
  readChaiDesignSystem,
  readChaiPageDesignBrief,
} from "./design-system-schema";

const NOW = new Date("2026-09-01T10:00:00.000Z");

const fullSections = Object.fromEntries(CHAI_DESIGN_SYSTEM_SECTIONS.map((section) => [section, `${section} rules`]));

const create = (patch: Parameters<typeof mergeChaiDesignSystem>[1] = {}) =>
  mergeChaiDesignSystem(null, { northStar: "Flour and fire", mode: "persuade", ...patch }, { source: "mcp", now: NOW });

const created = (patch: Parameters<typeof mergeChaiDesignSystem>[1] = {}): ChaiDesignSystem => {
  const result = create(patch);
  if (!result.ok) throw new Error(result.message);
  return result.next;
};

describe("mergeChaiDesignSystem", () => {
  it("refuses to create a design system without a north star and a mode", () => {
    const result = mergeChaiDesignSystem(null, { overview: "x" }, { source: "mcp" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/northStar and mode/);
  });

  it("creates a disabled design system with empty sections by default", () => {
    const ds = created();
    expect(ds.enabled).toBe(false);
    expect(ds.version).toBe(1);
    expect(ds.updatedAt).toBe(NOW.toISOString());
    expect(ds.source).toBe("mcp");
    for (const section of CHAI_DESIGN_SYSTEM_SECTIONS) expect(ds[section]).toBe("");
  });

  it("patches only the fields it is given", () => {
    const base = created({ overview: "Warm", colors: "Rye" });
    const result = mergeChaiDesignSystem(base, { colors: "Saffron", enabled: true }, { source: "mcp" });
    expect(result.ok && result.next).toMatchObject({ overview: "Warm", colors: "Saffron", enabled: true });
  });

  it("clears a section and the optional fields with null", () => {
    const base = created({ overview: "Warm", colorStrategy: "committed", antiReferences: ["purple gradients"] });
    const result = mergeChaiDesignSystem(
      base,
      { overview: null, colorStrategy: null, antiReferences: null },
      { source: "mcp" },
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.next.overview).toBe("");
    expect(result.next).not.toHaveProperty("colorStrategy");
    expect(result.next).not.toHaveProperty("antiReferences");
  });

  it("starts from scratch with replace", () => {
    const base = created({ overview: "Warm", enabled: true });
    const result = mergeChaiDesignSystem(
      base,
      { northStar: "Night market", mode: "experience" },
      {
        source: "mcp",
        replace: true,
      },
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.next).toMatchObject({ northStar: "Night market", mode: "experience", overview: "", enabled: false });
  });

  it("rejects a design system over the total length", () => {
    const long = "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.dosAndDonts);
    const result = create({
      overview: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.overview),
      colors: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.colors),
      typography: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.typography),
      layout: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.layout),
      components: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.components),
      dosAndDonts: long,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/limit is 12000/);
  });
});

describe("chaiDesignSystemSchema", () => {
  it("accepts a merged design system and rejects unknown keys", () => {
    const ds = created(fullSections);
    expect(chaiDesignSystemSchema.safeParse(ds).success).toBe(true);
    expect(chaiDesignSystemSchema.safeParse({ ...ds, fonts: "Inter" }).success).toBe(false);
  });

  it("rejects a section over its cap", () => {
    const ds = created();
    const tooLong = { ...ds, shapes: "x".repeat(CHAI_DESIGN_SYSTEM_LIMITS.sections.shapes + 1) };
    expect(chaiDesignSystemSchema.safeParse(tooLong).success).toBe(false);
  });

  it("validates page briefs", () => {
    expect(
      chaiPageDesignBriefSchema.safeParse({ mode: "read", thesis: "Answer first", updatedAt: NOW.toISOString() })
        .success,
    ).toBe(true);
    expect(chaiPageDesignBriefSchema.safeParse({ mode: "read", thesis: "" }).success).toBe(false);
  });
});

describe("status", () => {
  it("moves from not_set_up to disabled, partial and ready", () => {
    expect(designSystemStatus(null)).toBe("not_set_up");
    expect(designSystemStatus(created())).toBe("disabled");
    expect(designSystemStatus(created({ enabled: true }))).toBe("partial");
    expect(designSystemStatus(created({ ...fullSections, enabled: true }))).toBe("ready");
  });

  it("lists the unwritten sections", () => {
    expect(missingDesignSystemSections(created({ overview: "Warm", colors: "Rye" }))).toEqual([
      "typography",
      "layout",
      "elevation",
      "shapes",
      "components",
      "dosAndDonts",
    ]);
    expect(missingDesignSystemSections(null)).toHaveLength(8);
  });

  it("is active only when both the deployment and the site enabled it", () => {
    const enabled = created({ enabled: true });
    expect(isDesignSystemActive({ enabled: true }, enabled)).toBe(true);
    expect(isDesignSystemActive({ enabled: false }, enabled)).toBe(false);
    expect(isDesignSystemActive(undefined, enabled)).toBe(false);
    expect(isDesignSystemActive({ enabled: true }, created())).toBe(false);
    expect(isDesignSystemActive({ enabled: true }, null)).toBe(false);
  });
});

describe("readChaiDesignSystem", () => {
  it("reads a stored design system and fills missing sections", () => {
    const ds = readChaiDesignSystem({ northStar: "Flour", mode: "read", enabled: true, overview: "Warm" });
    expect(ds).toMatchObject({ northStar: "Flour", mode: "read", enabled: true, overview: "Warm", colors: "" });
  });

  it("reads anything unidentifiable as no design system", () => {
    expect(readChaiDesignSystem(undefined)).toBeNull();
    expect(readChaiDesignSystem("DESIGN.md")).toBeNull();
    expect(readChaiDesignSystem({ northStar: "Flour", mode: "loud" })).toBeNull();
    expect(readChaiDesignSystem({ mode: "read" })).toBeNull();
  });

  it("treats a missing enabled flag as disabled", () => {
    expect(readChaiDesignSystem({ northStar: "Flour", mode: "read" })?.enabled).toBe(false);
  });

  it("reads page briefs", () => {
    expect(readChaiPageDesignBrief({ mode: "operate", thesis: "Find the order fast", story: "" })).toEqual({
      mode: "operate",
      thesis: "Find the order fast",
      updatedAt: "",
    });
    expect(readChaiPageDesignBrief({ mode: "operate" })).toBeNull();
  });
});
