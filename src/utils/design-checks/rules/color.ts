import { allUtilities, baseUtilities, type StyleSet } from "../block-graph";
import { colorOf, isGradientUtility, type ColorRef } from "../classes";
import { CONTRAST_BODY, CONTRAST_LARGE, hexContrastRatio } from "../contrast";
import type { ChaiDesignFinding, ChaiDesignRule } from "../types";
import { blockFinding, listSome } from "./helpers";

export const gradientTextRule: ChaiDesignRule = {
  id: "gradient-text",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      const hit = node.styleSets.some((set) => {
        // As rendered, so gradient text carried by a `dt#` token is caught too.
        const utilities = allUtilities(set);
        return utilities.includes("bg-clip-text") && utilities.includes("text-transparent");
      });
      return hit
        ? [
            blockFinding(
              "gradient-text",
              "error",
              node,
              "Gradient text (bg-clip-text with text-transparent).",
              "Set the text in one solid theme colour (text-foreground or text-primary); carry colour in a surface or an accent element instead.",
            ),
          ]
        : [];
    }),
};

const PURPLE_STOP = /^(from|via|to)-(purple|violet|fuchsia)-\d+/;
const BLUE_STOP = /^(from|via|to)-(blue|indigo|sky)-\d+/;

export const purpleBlueGradientRule: ChaiDesignRule = {
  id: "purple-blue-gradient",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      const hit = node.styleSets.some((set) => {
        const utilities = allUtilities(set);
        return (
          utilities.some(isGradientUtility) &&
          utilities.some((u) => PURPLE_STOP.test(u)) &&
          utilities.some((u) => BLUE_STOP.test(u))
        );
      });
      return hit
        ? [
            blockFinding(
              "purple-blue-gradient",
              "error",
              node,
              "Purple-to-blue gradient, the most common AI-template look.",
              "Use the theme palette: a solid bg-primary or bg-muted surface, or a gradient between theme colours only when the design system calls for one.",
            ),
          ]
        : [];
    }),
};

/** Solid enough to read as the surface colour; `bg-primary/10` is a tint and fine under `text-primary`. */
const isSolid = (color: { opacity: number | null }) => color.opacity === null || color.opacity >= 50;

export const sameFamilyPairRule: ChaiDesignRule = {
  id: "same-family-pair",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      for (const set of node.styleSets) {
        // Compare within one state: a hover background against the base text is not a pair.
        const byState = new Map<string, { bg: string[]; text: string[] }>();
        for (const parsed of set.effective) {
          const key = parsed.variants.join(":");
          const group = byState.get(key) ?? { bg: [], text: [] };
          const bg = colorOf("bg", parsed.utility);
          if (bg?.kind === "semantic" && isSolid(bg)) group.bg.push(bg.name);
          const text = colorOf("text", parsed.utility);
          if (text?.kind === "semantic") group.text.push(text.name);
          byState.set(key, group);
        }
        for (const { bg, text } of byState.values()) {
          const clash = bg.find((name) => text.includes(name));
          if (clash) {
            return [
              blockFinding(
                "same-family-pair",
                "error",
                node,
                `bg-${clash} with text-${clash}: the text disappears into its own surface.`,
                "Pair each surface with its foreground: bg-primary text-primary-foreground, bg-card text-card-foreground, bg-muted text-muted-foreground.",
              ),
            ];
          }
        }
      }
      return [];
    }),
};

/** Theme colours that are a hue, not a neutral surface. */
const COLORED_SEMANTIC = new Set(["primary", "destructive", "success", "warning", "info", "purple", "orange", "aqua"]);

const isColoredColor = (color: ColorRef | null): boolean => {
  if (!color) return false;
  if (color.kind === "semantic") return COLORED_SEMANTIC.has(color.name) && isSolid(color);
  if (color.kind === "palette") return !color.neutral && color.shade >= 300 && isSolid(color);
  return false;
};

/** "colored", "neutral", or null when the block paints no background of its own. */
function backgroundKind(set: StyleSet | null): "colored" | "neutral" | null {
  const utilities = baseUtilities(set);
  if (utilities.some(isGradientUtility)) {
    const stops = utilities.filter((u) => /^(from|via|to)-/.test(u));
    return stops.some((u) => isColoredColor(colorOf(u.split("-")[0], u))) ? "colored" : "neutral";
  }
  // The last background colour wins, as in the rendered class list.
  for (let i = utilities.length - 1; i >= 0; i--) {
    const color = colorOf("bg", utilities[i]);
    if (!color) continue;
    if (color.kind === "transparent") return null;
    return isColoredColor(color) ? "colored" : "neutral";
  }
  return null;
}

export const grayOnColoredBgRule: ChaiDesignRule = {
  id: "gray-on-colored-bg",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      const textUtility = [...baseUtilities(node.main)].reverse().find((u) => colorOf("text", u));
      const textColor = textUtility ? colorOf("text", textUtility) : null;
      if (textColor?.kind !== "palette" || !textColor.neutral) return [];

      for (const candidate of [node, ...graph.ancestors(node)]) {
        const kind = backgroundKind(candidate.main);
        if (!kind) continue;
        if (kind === "neutral") return [];
        const where = candidate === node ? "its own background" : `the background of bid ${candidate.id}`;
        return [
          blockFinding(
            "gray-on-colored-bg",
            "error",
            node,
            `Gray text (${textUtility}) on a coloured surface (${where}).`,
            "Use the surface's own foreground (text-primary-foreground) or a tint of it (text-primary-foreground/80); never gray on colour.",
          ),
        ];
      }
      return [];
    }),
};

const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-x",
  "border-y",
  "border-t",
  "border-b",
  "border-l",
  "border-r",
  "ring",
  "from",
  "via",
  "to",
  "divide",
  "outline",
  "fill",
  "stroke",
  "decoration",
];

function rawColorOf(utility: string): boolean {
  for (const prefix of COLOR_PREFIXES) {
    const color = colorOf(prefix, utility);
    if (!color) continue;
    if (color.kind === "palette" || color.kind === "arbitrary") return true;
    // Solid black/white fight the theme and dark mode; `bg-black/50` is a scrim, which is fine.
    if (color.kind === "absolute") return color.opacity === null;
    return false;
  }
  return false;
}

export const rawPaletteColorRule: ChaiDesignRule = {
  id: "raw-palette-color",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      const offenders = [
        ...new Set(node.styleSets.flatMap((set) => set.raw.filter((c) => rawColorOf(c.utility)).map((c) => c.raw))),
      ];
      return offenders.length
        ? [
            blockFinding(
              "raw-palette-color",
              "warn",
              node,
              `Raw colours bypass the theme: ${listSome(offenders)}.`,
              "Use theme colours so the page follows the palette and dark mode: bg-primary/text-primary-foreground, bg-muted/text-muted-foreground, text-foreground, border-border.",
            ),
          ]
        : [];
    }),
};

/** Surface/foreground pairs every theme must keep readable. */
const THEME_PAIRS: Array<[string, string]> = [
  ["background", "foreground"],
  ["background", "muted-foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["info", "info-foreground"],
  ["purple", "purple-foreground"],
  ["orange", "orange-foreground"],
  ["aqua", "aqua-foreground"],
];

export type ThemeContrastIssue = {
  surface: string;
  text: string;
  mode: "light" | "dark";
  ratio: number;
  surfaceColor: string;
  textColor: string;
};

/** Every theme surface/foreground pair below 4.5:1, per mode. */
export function themeContrastIssues(colors: Record<string, unknown> | null | undefined): ThemeContrastIssue[] {
  if (!colors) return [];
  const issues: ThemeContrastIssue[] = [];
  for (const [surface, text] of THEME_PAIRS) {
    const bg = colors[surface];
    const fg = colors[text];
    if (!Array.isArray(bg) || !Array.isArray(fg)) continue;
    (["light", "dark"] as const).forEach((mode, i) => {
      const ratio = typeof bg[i] === "string" && typeof fg[i] === "string" ? hexContrastRatio(bg[i], fg[i]) : null;
      if (ratio === null || ratio >= CONTRAST_BODY) return;
      issues.push({ surface, text, mode, ratio, surfaceColor: bg[i], textColor: fg[i] });
    });
  }
  return issues;
}

export const describeContrastIssue = (issue: ThemeContrastIssue) =>
  `${issue.text} on ${issue.surface} is ${issue.ratio.toFixed(2)}:1 in ${issue.mode} mode (${issue.textColor} on ${issue.surfaceColor})`;

export const themeContrastRule: ChaiDesignRule = {
  id: "theme-contrast",
  run: (_graph, ctx) =>
    themeContrastIssues(ctx.theme?.colors as Record<string, unknown> | undefined).map(
      (issue): ChaiDesignFinding => ({
        rule: "theme-contrast",
        severity: issue.ratio < CONTRAST_LARGE ? "error" : "warn",
        scope: "site",
        message: `Theme: ${describeContrastIssue(issue)}.`,
        fix: "Adjust the theme pair until it reaches 4.5:1; 3:1 is enough only for large text.",
      }),
    ),
};

export const COLOR_RULES = [
  gradientTextRule,
  purpleBlueGradientRule,
  sameFamilyPairRule,
  grayOnColoredBgRule,
  rawPaletteColorRule,
  themeContrastRule,
];
