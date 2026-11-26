import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { CHAI_THEME_OPTIONAL_COLOR_KEYS } from "~/constants/THEME_COLOR_KEYS";
import { designSystemStatus, missingDesignSystemSections } from "~/server/chai-actions/ai/design-system-schema";
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import {
  CHAI_DESIGN_SYSTEM_SECTIONS,
  CHAI_DESIGN_SYSTEM_SECTION_TITLES,
  type ChaiDesignChecksMode,
  type ChaiDesignSystem,
  type ChaiPageDesignBrief,
} from "~/types/design-system";
import type { ChaiDesignTokens } from "~/types/types";
import { rulesInForce } from "./rules-in-force";

/** @internal */
export type DesignBriefInput = {
  siteName?: string;
  designSystem: ChaiDesignSystem | null;
  /** The site AI context: siteContext, tone, look, bannedWords. */
  product: Record<string, unknown>;
  theme: Partial<ChaiTheme> | null;
  designTokens: ChaiDesignTokens;
  /** Font families the site can use (the registered fonts). */
  fonts: string[];
  page?: { name: string; slug: string; brief: ChaiPageDesignBrief | null } | null;
  includeTokenValues?: boolean;
  checks: ChaiDesignChecksMode;
};

export const NOT_SET_UP_BRIEF = `# Design system: not set up
This site has no design system. Keep following the styling instructions as they are; there are no extra rules to apply.
Do not start a design-system setup on your own. When the user asks for one, asks for a new look or a redesign, or wants their pages to look consistent, offer it in one line, and start only when they ask for it or say yes: then call get_design_guide with topic "setup" and follow it.
What follows is the site's current look, the starting point for a setup.`;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function productSection(product: Record<string, unknown>): string | null {
  const lines = [
    str(product.siteContext) && `- About the site: ${clip(str(product.siteContext), 1200)}`,
    str(product.tone) && `- Tone: ${str(product.tone)}`,
    str(product.look) && `- Look (from the AI settings): ${str(product.look)}`,
    str(product.bannedWords) && `- Banned words: ${str(product.bannedWords)}`,
  ].filter(Boolean);
  return lines.length ? `## Site context\n${lines.join("\n")}` : null;
}

function systemSections(ds: ChaiDesignSystem): string {
  const head = [
    `North star: ${ds.northStar}`,
    `Default visitor mode: ${ds.mode}${ds.colorStrategy ? ` · Colour strategy: ${ds.colorStrategy}` : ""}`,
  ].join("\n");
  const sections = CHAI_DESIGN_SYSTEM_SECTIONS.map(
    (section) => `## ${CHAI_DESIGN_SYSTEM_SECTION_TITLES[section]}\n${ds[section].trim() || "(not written yet)"}`,
  );
  const anti = ds.antiReferences?.length
    ? [`## Refuses\n${ds.antiReferences.map((item) => `- ${item}`).join("\n")}`]
    : [];
  return [head, ...sections, ...anti].join("\n\n");
}

const COLOR_ROWS: string[][] = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["border", "input", "ring"],
];

function radiusLine(radius: string | undefined): string | null {
  if (!radius) return null;
  const px = /^(\d+(?:\.\d+)?)px$/.exec(radius);
  if (!px) return `- Radius: ${radius} (rounded-lg).`;
  const value = Number(px[1]);
  const step = (n: number) => `${Math.max(0, value - n)}px`;
  return `- Radius: ${radius}: rounded-lg is ${radius}, rounded-md ${step(2)}, rounded-sm ${step(4)}.`;
}

function themeSection(theme: Partial<ChaiTheme> | null, fonts: string[]): string | null {
  if (!theme) return null;
  const lines: string[] = [];
  const heading = theme.fontFamily?.heading;
  const body = theme.fontFamily?.body;
  if (heading || body) {
    lines.push(
      `- Fonts: headings "${heading ?? "?"}" (font-heading, applied to h1–h6 automatically); text "${body ?? "?"}" (font-body, applied to the page body).`,
    );
  }
  const radius = radiusLine(theme.borderRadius);
  if (radius) lines.push(radius);

  const colors = (theme.colors ?? {}) as Record<string, [string, string] | undefined>;
  const describe = (key: string) => {
    const pair = colors[key];
    return Array.isArray(pair) ? `${key} ${pair[0]} | ${pair[1]}` : null;
  };
  const extras: string[][] = [];
  for (let i = 0; i < CHAI_THEME_OPTIONAL_COLOR_KEYS.length; i += 2) {
    extras.push([CHAI_THEME_OPTIONAL_COLOR_KEYS[i], CHAI_THEME_OPTIONAL_COLOR_KEYS[i + 1]]);
  }
  const rows = [...COLOR_ROWS, ...extras].map((row) => row.map(describe).filter(Boolean).join(" · ")).filter(Boolean);
  if (rows.length) {
    lines.push(
      `- Colours as light | dark, used as bg-*, text-* and border-* utilities:\n${rows.map((row) => `  ${row}`).join("\n")}`,
    );
  }
  if (fonts.length) {
    lines.push(
      fonts.length <= 60
        ? `- Fonts the site can use: ${fonts.join(", ")}.`
        : `- ${fonts.length} fonts are registered; the theme accepts registered families only.`,
    );
  }
  return lines.length ? `## Theme (draft values)\n${lines.join("\n")}` : null;
}

const tokenFamily = (id: string) => id.slice(3).split("-")[0];

function tokensSection(siteTokens: ChaiDesignTokens, includeValues: boolean): string {
  const lines: string[] = [];

  const restyled = new Set(
    Object.keys(CHAI_BUILT_IN_DESIGN_TOKENS).filter((id) => {
      const override = siteTokens[id];
      return override && !override.archived && override.value !== CHAI_BUILT_IN_DESIGN_TOKENS[id].value;
    }),
  );
  const families = new Map<string, string[]>();
  for (const id of Object.keys(CHAI_BUILT_IN_DESIGN_TOKENS)) {
    if (siteTokens[id]?.archived) continue;
    const family = tokenFamily(id);
    families.set(family, [...(families.get(family) ?? []), `${id}${restyled.has(id) ? "*" : ""}`]);
  }
  lines.push(...[...families.values()].map((ids) => `- ${ids.join(", ")}`));
  const custom = Object.entries(siteTokens).filter(
    ([id, token]) => !(id in CHAI_BUILT_IN_DESIGN_TOKENS) && token && !token.archived,
  );

  const valueLines: string[] = [];
  if (includeValues) {
    for (const [id, token] of Object.entries(CHAI_BUILT_IN_DESIGN_TOKENS)) {
      if (siteTokens[id]?.archived) continue;
      valueLines.push(`- ${id} (${token.name}): ${siteTokens[id]?.value ?? token.value}`);
    }
  } else {
    for (const id of restyled) valueLines.push(`- ${id} (restyled): ${clip(siteTokens[id].value, 160)}`);
  }
  for (const [id, token] of custom) {
    valueLines.push(
      `- ${id} "${token.name}"${token.description ? ` (${token.description})` : ""}: ${clip(token.value, 160)}`,
    );
  }

  return [
    `## Design tokens\nReuse these; never invent one. Put them first in a class list: class="dt#btn dt#btn-primary px-6". * marks a built-in this site restyled.`,
    lines.join("\n"),
    ...(valueLines.length ? [`Values:\n${valueLines.join("\n")}`] : []),
  ].join("\n");
}

function pageSection(page: NonNullable<DesignBriefInput["page"]>, suggest: boolean): string | null {
  const title = `## Page brief: ${page.name} (${page.slug || "partial"})`;
  if (!page.brief) {
    return suggest
      ? `${title}\nNone yet. Before building this page from scratch, propose one (visitor mode, thesis, first viewport) and save it with save_design_system (url and pageBrief).`
      : null;
  }
  const b = page.brief;
  const lines = [
    `- Visitor mode: ${b.mode}`,
    `- Thesis: ${b.thesis}`,
    b.story && `- Story: ${b.story}`,
    b.firstViewport && `- First viewport: ${b.firstViewport}`,
    b.notes && `- Notes: ${b.notes}`,
  ].filter(Boolean);
  return `${title}\n${lines.join("\n")}`;
}

/**
 * The design brief an agent (MCP or Builder AI) works from: the site's written design system,
 * the theme and tokens that are its values, the page brief, and — only when the design system
 * is enabled — the rules in force.
 * @internal
 */
export function composeDesignBrief(input: DesignBriefInput): string {
  const status = designSystemStatus(input.designSystem);
  const baseline = [
    productSection(input.product),
    themeSection(input.theme, input.fonts),
    tokensSection(input.designTokens, input.includeTokenValues === true),
  ];
  if (status === "not_set_up" || !input.designSystem) {
    return [NOT_SET_UP_BRIEF, ...baseline].filter((part): part is string => !!part).join("\n\n");
  }
  const ds = input.designSystem;
  const enabled = status !== "disabled";

  const header = enabled
    ? `# Design system: enabled${status === "partial" ? ` (incomplete: ${missingDesignSystemSections(ds).join(", ")} not written yet)` : ""}\nFollow it on every page you build or edit${input.siteName ? ` on ${input.siteName}` : ""}. The theme and tokens are the values; the sections are the rules for using them. Never invent a palette, font, radius or card style for one page.`
    : `# Design system: saved, not enabled\nThis site has a saved design system that is NOT enabled: keep following the styling instructions as they are, and treat what follows as reference only. Enable it only when the user confirms, with save_design_system and enabled: true.`;

  const parts = [
    header,
    systemSections(ds),
    ...baseline,
    input.page ? pageSection(input.page, enabled) : null,
    enabled ? rulesInForce(input.checks) : null,
  ];
  return parts.filter((part): part is string => !!part).join("\n\n");
}
