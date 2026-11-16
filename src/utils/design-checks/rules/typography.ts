import { baseUtilities, headingLevel, type DesignGraph, type DesignNode } from "../block-graph";
import type { ChaiDesignRule } from "../types";
import { blockFinding, listSome, pageFinding, shortText } from "./helpers";

export const multipleH1Rule: ChaiDesignRule = {
  id: "multiple-h1",
  run: (graph, ctx) => {
    if (ctx.isPartial) return [];
    const h1s = graph.nodes.filter((node) => headingLevel(node) === 1);
    return h1s.length > 1
      ? [
          pageFinding(
            "multiple-h1",
            "error",
            h1s,
            `${h1s.length} h1 headings on the page.`,
            "Keep one h1 for the page's main title and make the others h2; restyle with classes, not with the level.",
          ),
        ]
      : [];
  },
};

export const headingOrderRule: ChaiDesignRule = {
  id: "heading-order",
  run: (graph, ctx) => {
    if (ctx.isPartial) return [];
    const skips: Array<{ node: DesignNode; from: number; to: number }> = [];
    let previous: number | null = null;
    for (const node of graph.nodes) {
      const level = headingLevel(node);
      if (level === null) continue;
      if (previous !== null && level > previous + 1) skips.push({ node, from: previous, to: level });
      previous = level;
    }
    return skips.length
      ? [
          pageFinding(
            "heading-order",
            "warn",
            skips.map((skip) => skip.node),
            `Heading levels skip: ${listSome(skips.map((skip) => `h${skip.from} → h${skip.to}`))}.`,
            "Step down one level at a time (h2 → h3); pick the level for structure and set the size with classes.",
          ),
        ]
      : [];
  },
};

const SMALL_TEXT = /^text-(xs|sm|\[(?:[0-9]|1[0-4])px\])$/;

export const eyebrowKickerRule: ChaiDesignRule = {
  id: "eyebrow-kicker",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      if (!node.text || node.text.length > 60 || headingLevel(node) !== null) return [];
      const utilities = baseUtilities(node.main);
      const looksLikeEyebrow =
        utilities.includes("uppercase") &&
        utilities.some((u) => /^tracking-(wide|wider|widest|\[)/.test(u)) &&
        utilities.some((u) => SMALL_TEXT.test(u));
      if (!looksLikeEyebrow) return [];
      const next = graph.nextSibling(node);
      return next && headingLevel(next) !== null
        ? [
            blockFinding(
              "eyebrow-kicker",
              "warn",
              node,
              `Eyebrow label above a heading ("${shortText(node.text)}").`,
              "Drop the kicker and let the heading carry the section; if the category matters, say it in the heading or a quiet line below it.",
            ),
          ]
        : [];
    }),
};

const CODE_TAGS = new Set(["pre", "code", "kbd", "samp"]);
const isCodeContext = (graph: DesignGraph, node: DesignNode) =>
  [node, ...graph.ancestors(node)].some((n) => CODE_TAGS.has(n.tag) || n.block._name === "Code");

/** `font-[500]` is a weight; `font-['Inter']` or `font-[Inter]` is a family. */
const isArbitraryFamily = (utility: string) => /^font-\[/.test(utility) && !/^font-\[\d+\]$/.test(utility);

export const offThemeFontRule: ChaiDesignRule = {
  id: "off-theme-font",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      const offenders = new Set<string>();
      for (const set of node.styleSets) {
        // As rendered, so a font carried by a `dt#` token is caught too.
        for (const parsed of set.effective) {
          const u = parsed.utility;
          if (isArbitraryFamily(u) || u === "font-sans" || u === "font-serif") offenders.add(parsed.raw);
          else if (u === "font-mono" && !isCodeContext(graph, node)) offenders.add(parsed.raw);
        }
      }
      return offenders.size
        ? [
            blockFinding(
              "off-theme-font",
              "warn",
              node,
              `${listSome([...offenders])} bypasses the theme fonts.`,
              "Headings already use the theme heading font and text the body font; use font-heading or font-body to switch, and keep mono for code.",
            ),
          ]
        : [];
    }),
};

const PROSE_TYPES = new Set(["Paragraph", "RichText", "Text"]);
const WIDE_MEASURE = /^max-w-(4xl|5xl|6xl|7xl|full|none|screen(-\w+)?)$/;

export const longMeasureRule: ChaiDesignRule = {
  id: "long-measure",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      if (!PROSE_TYPES.has(node.type)) return [];
      const wide = baseUtilities(node.main).find((u) => WIDE_MEASURE.test(u));
      return wide
        ? [
            blockFinding(
              "long-measure",
              "warn",
              node,
              `Body text set wider than a comfortable measure (${wide}).`,
              "Keep paragraphs to about 65–75 characters a line: max-w-prose or max-w-2xl.",
            ),
          ]
        : [];
    }),
};

export const TYPOGRAPHY_RULES = [
  multipleH1Rule,
  headingOrderRule,
  eyebrowKickerRule,
  offThemeFontRule,
  longMeasureRule,
];
