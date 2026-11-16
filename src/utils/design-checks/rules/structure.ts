import { baseUtilities, type DesignGraph, type DesignNode } from "../block-graph";
import { colorOf, isBorderWidthUtility, isRoundedUtility, isShadowUtility } from "../classes";
import type { ChaiDesignRule } from "../types";
import { blockFinding, pageFinding } from "./helpers";

const CONTAINER_TYPES = new Set(["Box", "EmptyBox", "Link", "ListItem", "Column"]);

const hasPadding = (utilities: string[]) =>
  utilities.some((u) => {
    const match = /^p[xytblrse]?-(\d+(?:\.\d+)?)$/.exec(u);
    return match ? Number(match[1]) >= 3 : false;
  });

function isCardLike(node: DesignNode): boolean {
  if (!CONTAINER_TYPES.has(node.type) || node.childIds.length === 0) return false;
  if (node.main?.tokens.includes("dt#card")) return true;
  const utilities = baseUtilities(node.main);
  const surfaced = utilities.some(isBorderWidthUtility) || utilities.some(isShadowUtility);
  return utilities.some(isRoundedUtility) && surfaced && hasPadding(utilities);
}

export const nestedCardsRule: ChaiDesignRule = {
  id: "nested-cards",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      if (!isCardLike(node)) return [];
      const outer = graph
        .ancestors(node)
        .slice(0, 3)
        .find((ancestor) => isCardLike(ancestor));
      return outer
        ? [
            blockFinding(
              "nested-cards",
              "warn",
              node,
              `A card inside a card (outer card: bid ${outer.id}).`,
              "Keep one container level: drop the inner border or shadow and group with spacing, a divider or a background tint.",
            ),
          ]
        : [];
    }),
};

const SIGNATURE_DEPTH = 3;
const MIN_SIGNATURE_NODES = 6;
const MIN_REPEATS = 3;

function signature(graph: DesignGraph, node: DesignNode, depth: number): { text: string; size: number } {
  const own = node.tag ? `${node.type}#${node.tag}` : node.type;
  if (depth === 0) return { text: own, size: 1 };
  const children = graph.children(node).map((child) => signature(graph, child, depth - 1));
  return {
    text: `${own}(${children.map((child) => child.text).join(",")})`,
    size: 1 + children.reduce((sum, child) => sum + child.size, 0),
  };
}

/**
 * Three or more top-level sections with the same structure (heading + three-card grid, over
 * and over) — the monotony impeccable calls "repetitive grids". Same spacing and type scale
 * across sections is consistency; the same composition in every section is not.
 */
export const repeatedSectionLayoutRule: ChaiDesignRule = {
  id: "repeated-section-layout",
  run: (graph) => {
    const groups = new Map<string, DesignNode[]>();
    for (const root of graph.roots) {
      const sig = signature(graph, root, SIGNATURE_DEPTH);
      if (sig.size < MIN_SIGNATURE_NODES) continue;
      groups.set(sig.text, [...(groups.get(sig.text) ?? []), root]);
    }
    return [...groups.values()]
      .filter((group) => group.length >= MIN_REPEATS)
      .map((group) =>
        pageFinding(
          "repeated-section-layout",
          "warn",
          group,
          `${group.length} sections share the same structure.`,
          "Vary composition inside the system (a split layout, a full-bleed image, a list, a quote) while keeping the same spacing and type scale.",
        ),
      );
  },
};

const animationOf = (node: DesignNode): string | null => {
  const attrs = (node.block as Record<string, unknown>).styles_attrs as Record<string, unknown> | undefined;
  const value = attrs?.["data-animation"];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.split("|")[0].trim() || null;
};

const rootOf = (graph: DesignGraph, node: DesignNode): DesignNode => {
  const chain = graph.ancestors(node);
  return chain.length ? chain[chain.length - 1] : node;
};

export const identicalEntranceAnimationRule: ChaiDesignRule = {
  id: "identical-entrance-animation",
  run: (graph) => {
    const animated = graph.nodes
      .map((node) => ({ node, name: animationOf(node) }))
      .filter((entry): entry is { node: DesignNode; name: string } => entry.name !== null);
    const names = new Set(animated.map((entry) => entry.name));
    if (names.size !== 1) return [];
    const sections = new Set(animated.map((entry) => rootOf(graph, entry.node).id));
    if (sections.size < 3) return [];
    const [name] = names;
    return [
      pageFinding(
        "identical-entrance-animation",
        "warn",
        animated.map((entry) => entry.node),
        `The same entrance animation (${name}) on ${sections.size} sections.`,
        "Keep one authored motion moment per page and let the other sections arrive without an entrance animation.",
      ),
    ];
  },
};

export const STRUCTURE_RULES = [nestedCardsRule, repeatedSectionLayoutRule, identicalEntranceAnimationRule];

// Exported for the interaction rules, which share the notion of a painted surface.
export const paintsSurface = (utilities: string[]) =>
  utilities.some((u) => {
    const bg = colorOf("bg", u);
    return bg !== null && bg.kind !== "transparent";
  }) || utilities.some(isBorderWidthUtility);
