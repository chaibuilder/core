import { getSplitChaiClasses } from "~/builder/hooks/get-split-classes";
import { generateClassNames } from "~/builder/core/components/canvas/static/new-blocks-render-helpers";
import { DESIGN_TOKEN_PREFIX, STYLES_KEY } from "~/constants/STRINGS";
import type { ChaiBlock } from "~/types/common";
import type { ChaiDesignTokens } from "~/types/types";
import { parseClass, splitClassList, type ParsedClass } from "./classes";

/** One `#styles:` prop of a block: the classes as written and as rendered. */
export type StyleSet = {
  prop: string;
  /** Classes as written (base + user), design tokens included as `dt#…`. */
  raw: ParsedClass[];
  /** Classes as rendered: tokens expanded, conflicts resolved. */
  effective: ParsedClass[];
  /** The `dt#…` tokens written on this prop. */
  tokens: string[];
};

export type DesignNode = {
  block: ChaiBlock;
  id: string;
  type: string;
  /** Lowercased `tag` prop (`section`, `h2`, `a`…), or "". */
  tag: string;
  parentId: string | null;
  childIds: string[];
  /** Position in document order. */
  index: number;
  styleSets: StyleSet[];
  /** The `styles` prop — the block's own element. */
  main: StyleSet | null;
  /** Visible text, markup stripped. */
  text: string;
};

export type DesignGraph = {
  nodes: DesignNode[];
  byId: Map<string, DesignNode>;
  roots: DesignNode[];
  parent: (node: DesignNode) => DesignNode | null;
  /** Nearest first. */
  ancestors: (node: DesignNode) => DesignNode[];
  children: (node: DesignNode) => DesignNode[];
  nextSibling: (node: DesignNode) => DesignNode | null;
};

const TEXT_PROP_KEYS = ["content", "text", "title", "label", "heading"] as const;
const INTERACTIVE_TYPES = new Set(["Button", "Link", "FormButton", "LightBoxLink"]);

const stripMarkup = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function blockText(block: ChaiBlock): string {
  const record = block as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of TEXT_PROP_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) parts.push(stripMarkup(value));
  }
  return parts.join(" ").trim();
}

function styleSetsOf(block: ChaiBlock, designTokens: ChaiDesignTokens): StyleSet[] {
  const sets: StyleSet[] = [];
  for (const [prop, value] of Object.entries(block as Record<string, unknown>)) {
    if (typeof value !== "string" || !value.startsWith(STYLES_KEY)) continue;
    const { baseClasses, classes } = getSplitChaiClasses(value);
    const raw = splitClassList(`${baseClasses} ${classes}`).map(parseClass);
    const effective = splitClassList(generateClassNames(value, designTokens)).map(parseClass);
    const tokens = raw.map((c) => c.raw).filter((c) => c.startsWith(DESIGN_TOKEN_PREFIX));
    sets.push({ prop, raw, effective, tokens });
  }
  return sets;
}

export function buildDesignGraph(blocks: ChaiBlock[], designTokens: ChaiDesignTokens = {}): DesignGraph {
  const ids = new Set(blocks.map((block) => block._id));
  const childrenByParent = new Map<string | null, ChaiBlock[]>();
  for (const block of blocks) {
    // A parent that is not on the page (a stale reference) makes the block a root.
    const parent = block._parent && ids.has(block._parent) ? block._parent : null;
    const list = childrenByParent.get(parent);
    if (list) list.push(block);
    else childrenByParent.set(parent, [block]);
  }

  const nodes: DesignNode[] = [];
  const byId = new Map<string, DesignNode>();
  const visit = (block: ChaiBlock, parentId: string | null) => {
    if (byId.has(block._id)) return; // Defensive: a cycle or duplicate id is visited once.
    const sets = styleSetsOf(block, designTokens);
    const node: DesignNode = {
      block,
      id: block._id,
      type: block._type,
      tag: typeof block.tag === "string" ? block.tag.toLowerCase() : "",
      parentId,
      childIds: [],
      index: nodes.length,
      styleSets: sets,
      main: sets.find((set) => set.prop === "styles") ?? null,
      text: blockText(block),
    };
    nodes.push(node);
    byId.set(node.id, node);
    for (const child of childrenByParent.get(block._id) ?? []) {
      if (byId.has(child._id)) continue;
      node.childIds.push(child._id);
      visit(child, block._id);
    }
  };
  for (const root of childrenByParent.get(null) ?? []) visit(root, null);

  const parent = (node: DesignNode) => (node.parentId ? (byId.get(node.parentId) ?? null) : null);
  const children = (node: DesignNode) => node.childIds.map((id) => byId.get(id)).filter((n): n is DesignNode => !!n);
  return {
    nodes,
    byId,
    roots: nodes.filter((node) => node.parentId === null),
    parent,
    ancestors: (node) => {
      const chain: DesignNode[] = [];
      for (let current = parent(node); current; current = parent(current)) chain.push(current);
      return chain;
    },
    children,
    nextSibling: (node) => {
      const siblings = node.parentId
        ? (byId.get(node.parentId)?.childIds ?? [])
        : nodes.filter((n) => !n.parentId).map((n) => n.id);
      const at = siblings.indexOf(node.id);
      return at >= 0 && at + 1 < siblings.length ? (byId.get(siblings[at + 1]) ?? null) : null;
    },
  };
}

export const isInteractive = (node: DesignNode) =>
  INTERACTIVE_TYPES.has(node.type) ||
  ((node.type === "Box" || node.type === "EmptyBox") && ["a", "button"].includes(node.tag));

/** Heading level from a Heading block's tag (h1–h6; h1 when unset, as the Heading block renders it), else null. */
export function headingLevel(node: DesignNode): number | null {
  if (node.type !== "Heading") return null;
  const match = /^h([1-6])$/.exec(node.tag || "h1");
  return match ? Number(match[1]) : null;
}

/** Utilities of a style set in the base state (no variant). */
export const baseUtilities = (set: StyleSet | null | undefined, which: "raw" | "effective" = "effective") =>
  (set?.[which] ?? []).filter((c) => c.variants.length === 0).map((c) => c.utility);

/** Every utility of a style set, any variant. */
export const allUtilities = (set: StyleSet | null | undefined, which: "raw" | "effective" = "effective") =>
  (set?.[which] ?? []).map((c) => c.utility);
