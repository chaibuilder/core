import { parse, stringify } from "himalaya";
import { kebabCase } from "lodash-es";
import { canAddChildBlock, getBlockActionAttrs, getSlotAcceptAttrs } from "~/builder/core/functions/block-helpers";
import { STYLES_KEY } from "~/constants/STRINGS";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types/common";
import { CORE_BLOCKS_SET } from "~/utils/core-blocks";
import {
  encodeStyleText,
  preserveStyleText,
  STYLE_TEXT_ENCODING,
  STYLE_TEXT_ENCODING_ATTR,
} from "~/utils/style-text-transport";

/**
 * Server-side inverse of `getBlocksFromHTML` — turns a blocks JSON array into
 * the same AI-HTML representation the builder client produces from the canvas
 * (see use-blocks-html-for-ai.ts `transformNode`): core blocks become plain
 * semantic HTML, everything else becomes a `<chai-{kebab-type}>` web component,
 * and every element carries a `bid` attribute holding its block id.
 *
 * This is what the MCP `read_block_html` tool serves so an MCP client sees the
 * page in exactly the format the AI page-edit tools expect to read and rewrite.
 */

type HimalayaNode = {
  type: "element" | "text" | "comment";
  tagName?: string;
  attributes?: Array<{ key: string; value: string }>;
  children?: HimalayaNode[];
  content?: string;
};

const el = (
  tagName: string,
  attributes: Array<{ key: string; value: string }>,
  children: HimalayaNode[] = [],
): HimalayaNode => ({ type: "element", tagName, attributes, children });

const text = (content: string): HimalayaNode => ({ type: "text", content });

/**
 * Structural keys reconstructed from the DOM tree on import (or carried by the
 * `bid` attribute) — the only keys a custom block never re-emits. Every other
 * prop IS emitted, which is what makes styles props (any key holding a
 * `#styles:` value), their `${key}_attrs` companions, and content/richtext
 * props (any key) round-trip generically — mirroring the builder client
 * exporter (use-blocks-html-for-ai `transformNode`).
 */
const CUSTOM_STRUCTURAL_KEYS = new Set([
  "_id",
  "_type",
  "_parent",
  "_index",
  "_canDelete",
  "_canMove",
  "_canDuplicate",
]);

/** Types whose `content` string is rendered as a single text child. */
const TEXT_CONTENT_TYPES = new Set(["Heading", "Span", "Button", "FormButton", "Label", "ListItem", "Link", "Text"]);

/** Extract the tailwind class string from a `#styles:,<classes>` styles value. */
const classFromStyles = (styles: unknown): string => {
  if (typeof styles !== "string") return "";
  if (!styles.startsWith(STYLES_KEY)) return "";
  return styles.slice(STYLES_KEY.length).replace(/^,/, "").trim();
};

/** kebab-case a block prop key, preserving a leading underscore (mirrors transformNode). */
const attrKeyFor = (key: string): string => (key.startsWith("_") ? "_" + kebabCase(key.slice(1)) : kebabCase(key));

const attrValueFor = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

/** Common attributes every emitted element carries: class, bid, chai-name, styles_attrs. */
const baseAttrs = (block: ChaiBlock): Array<{ key: string; value: string }> => {
  const attrs: Array<{ key: string; value: string }> = [];
  const cls = classFromStyles((block as any).styles);
  if (cls) attrs.push({ key: "class", value: cls });
  if (block._name && block._name !== block._type) attrs.push({ key: "chai-name", value: block._name });
  const stylesAttrs = (block as any).styles_attrs;
  if (stylesAttrs && typeof stylesAttrs === "object") {
    for (const [k, v] of Object.entries(stylesAttrs)) {
      attrs.push({ key: k, value: attrValueFor(v) });
    }
  }
  attrs.push({ key: "bid", value: block._id });
  attrs.push(...getBlockActionAttrs(block));
  return attrs;
};

/** Parse a raw HTML string (rich text / video embed / svg) into himalaya nodes. */
const parseHtml = (html: unknown): HimalayaNode[] => {
  if (typeof html !== "string" || html.trim() === "") return [];
  try {
    return parse(html) as HimalayaNode[];
  } catch {
    return [];
  }
};

const coreTagName = (block: ChaiBlock): string => {
  const b = block as any;
  switch (block._type) {
    case "Heading":
      return typeof b.tag === "string" ? b.tag : "h1";
    case "Paragraph":
    case "RichText":
      return "p";
    case "Text":
      // Text renders `<span>` in-builder (web-blocks/text.tsx), so the client
      // AI-HTML exporter emits a span too. Match it so the block carries a `bid`
      // (sliceable by read_block_html, reattachable by mergeBlocksWithExisting).
      return "span";
    case "Span":
      return typeof b.tag === "string" ? b.tag : "span";
    case "Link":
      return "a";
    case "Button":
    case "FormButton":
      return "button";
    case "Input":
    case "Checkbox":
    case "Radio":
      return "input";
    case "TextArea":
      return "textarea";
    case "Select":
      return "select";
    case "Divider":
      return "hr";
    case "LineBreak":
      return "br";
    case "List":
      return typeof b.tag === "string" ? b.tag : "ul";
    case "ListItem":
      return typeof b.tag === "string" ? b.tag : "li";
    case "Label":
      return "label";
    case "Form":
      return "form";
    case "Box":
    case "EmptyBox":
    default:
      return typeof b.tag === "string" ? b.tag : "div";
  }
};

/**
 * Emit the type-specific attributes that `getBlocksFromHTML` maps back into
 * props (the inverse of ATTRIBUTE_MAP / getBlockProps in html-to-json.ts).
 */
const typeSpecificAttrs = (block: ChaiBlock): Array<{ key: string; value: string }> => {
  const b = block as any;
  const attrs: Array<{ key: string; value: string }> = [];
  switch (block._type) {
    case "Link": {
      const link = b.link ?? {};
      if (link.href) attrs.push({ key: "href", value: String(link.href) });
      if (link.target) attrs.push({ key: "target", value: String(link.target) });
      break;
    }
    case "Input":
    case "Checkbox":
    case "Radio": {
      const inputType =
        block._type === "Checkbox" ? "checkbox" : block._type === "Radio" ? "radio" : b.inputType || "text";
      attrs.push({ key: "type", value: String(inputType) });
      if (b.placeholder) attrs.push({ key: "placeholder", value: String(b.placeholder) });
      if (b.fieldName) attrs.push({ key: "name", value: String(b.fieldName) });
      if (b.required) attrs.push({ key: "required", value: "" });
      break;
    }
    case "TextArea": {
      if (b.placeholder) attrs.push({ key: "placeholder", value: String(b.placeholder) });
      if (b.fieldName) attrs.push({ key: "name", value: String(b.fieldName) });
      if (b.required) attrs.push({ key: "required", value: "" });
      break;
    }
    case "Select": {
      if (b.fieldName) attrs.push({ key: "name", value: String(b.fieldName) });
      if (b.placeholder) attrs.push({ key: "placeholder", value: String(b.placeholder) });
      if (b.multiple) attrs.push({ key: "multiple", value: "" });
      break;
    }
    case "FormButton":
      attrs.push({ key: "type", value: "submit" });
      break;
    case "Form": {
      if (b.action) attrs.push({ key: "action", value: String(b.action) });
      break;
    }
  }
  return attrs;
};

const buildCoreNode = (block: ChaiBlock, childNodes: HimalayaNode[]): HimalayaNode => {
  const b = block as any;
  const tag = coreTagName(block);
  const attrs = [...typeSpecificAttrs(block), ...baseAttrs(block)].filter(
    (attr) => tag !== "style" || attr.key !== STYLE_TEXT_ENCODING_ATTR,
  );
  if (tag === "style") attrs.push({ key: STYLE_TEXT_ENCODING_ATTR, value: STYLE_TEXT_ENCODING });

  // Select: children are <option> elements derived from the options array.
  if (block._type === "Select" && Array.isArray(b.options)) {
    const optionNodes = b.options.map((opt: any) => {
      const optAttrs: Array<{ key: string; value: string }> = [];
      for (const [k, v] of Object.entries(opt)) {
        if (k === "label") continue;
        optAttrs.push({ key: k, value: attrValueFor(v) });
      }
      return el("option", optAttrs, opt.label ? [text(String(opt.label))] : []);
    });
    return el(tag, attrs, optionNodes);
  }

  // Rich text / embeds: content is raw HTML rendered as children.
  if (block._type === "RichText" || block._type === "Paragraph") {
    const content = typeof b.content === "string" ? b.content : "";
    const inner = parseHtml(content);
    // Paragraph content is often wrapped in its own <p>; unwrap a single <p>.
    if (block._type === "Paragraph" && inner.length === 1 && inner[0].tagName === "p") {
      return el(tag, attrs, inner[0].children ?? []);
    }
    if (inner.length) return el(tag, attrs, [...inner, ...childNodes]);
    if (childNodes.length) return el(tag, attrs, childNodes);
    return el(tag, attrs, content ? [text(content)] : []);
  }

  if (block._type === "Video") {
    const nodes = parseHtml(b.content);
    const findMedia = (ns: HimalayaNode[]): HimalayaNode | undefined => {
      for (const n of ns) {
        if (n.type === "element" && (n.tagName === "iframe" || n.tagName === "video")) return n;
        const found = n.children ? findMedia(n.children) : undefined;
        if (found) return found;
      }
    };

    const media = findMedia(nodes);
    if (media && media.type === "element") {
      media.attributes = [...(media.attributes ?? []), ...attrs];
      return media;
    }

    if (typeof b.url === "string" && b.url.trim() !== "") {
      return el("iframe", [{ key: "src", value: b.url }, ...attrs], []);
    }

    return el("div", attrs, nodes);
  }

  // Void elements never take children.
  if (tag === "img" || tag === "hr" || tag === "br" || tag === "input") {
    return el(tag, attrs, []);
  }

  // Leaf text blocks: render `content` as a text child when there are no child blocks.
  if (childNodes.length === 0 && TEXT_CONTENT_TYPES.has(block._type) && typeof b.content === "string" && b.content) {
    return el(tag, attrs, [text(b.content)]);
  }

  return el(tag, attrs, childNodes);
};

/** The Lucide icon name carried by an Icon block's SVG, when one is derivable. */
const lucideIconName = (icon: unknown): string | null => {
  const svg = typeof icon === "string" ? icon : "";
  if (!svg || svg.includes("chai-default-svg")) return null;
  const tokens: string[] | null = svg.match(/\blucide-([\w-]+)\b/g);
  if (!tokens) return null;
  const names = tokens.map((t: string) => t.replace("lucide-", ""));
  return names.find((n: string) => !n.endsWith("-icon")) ?? names[0].replace(/-icon$/, "");
};

const buildCustomNode = (block: ChaiBlock, childNodes: HimalayaNode[], parentType?: string): HimalayaNode => {
  const tagName = `chai-${kebabCase(block._type)}`;
  const attrs: Array<{ key: string; value: string }> = [{ key: "chai-type", value: block._type }];

  // Derived up front so the prop loop below knows whether dropping the raw
  // `icon` SVG is safe. If no name can be extracted (non-Lucide or unexpected
  // markup), keeping the SVG is the only way the icon survives a read → edit
  // round-trip — otherwise the element carries neither and the icon is lost.
  const iconName = block._type === "Icon" ? lucideIconName((block as Record<string, unknown>).icon) : null;

  // Emit every prop except the structural keys. This is what makes the
  // representation generic: a block can carry any number of styles props (each
  // a `#styles:`-prefixed string, e.g. `styles`, `iconStyles`), each with an
  // optional `${key}_attrs` companion object, plus content/richtext props under
  // any key — all of them round-trip because they're re-emitted verbatim (with
  // objects JSON-stringified), matching the builder client `transformNode`.
  // `_name` is intentionally kept (only _id/_type/_parent/_index are dropped).
  for (const [key, value] of Object.entries(block)) {
    if (CUSTOM_STRUCTURAL_KEYS.has(key)) continue;
    if (value === undefined) continue;
    // Icon's raw SVG is replaced with `icon-name` below — but only drop it when
    // a name was actually derived, otherwise the icon data would vanish.
    if (block._type === "Icon" && key === "icon" && iconName) continue;
    attrs.push({ key: attrKeyFor(key), value: attrValueFor(value) });
  }

  attrs.push({ key: "bid", value: block._id });

  const blockDef = getRegisteredChaiBlock(block._type);
  if (blockDef?.description) attrs.push({ key: "about-this-component", value: blockDef.description });

  attrs.push(...getBlockActionAttrs(block));
  attrs.push(...getSlotAcceptAttrs(block, parentType));

  if (iconName) attrs.push({ key: "icon-name", value: iconName });

  const children = canAddChildBlock(block._type) ? childNodes : [];
  return el(tagName, attrs, children);
};

const buildNode = (block: ChaiBlock, byParent: Map<string | null, ChaiBlock[]>, parentType?: string): HimalayaNode => {
  const children = byParent.get(block._id) ?? [];
  // <style> content is raw text: a Text child emitted as <span> would be
  // re-imported as part of the CSS.
  const isStyle = (block as any).tag === "style";
  const childNodes = children.map((child) =>
    isStyle && child._type === "Text"
      ? text(encodeStyleText(String((child as any).content ?? "")))
      : buildNode(child, byParent, block._type),
  );

  if (CORE_BLOCKS_SET.has(block._type)) {
    return buildCoreNode(block, childNodes);
  }
  return buildCustomNode(block, childNodes, parentType);
};

/**
 * Convert a blocks JSON array to the AI-HTML string. `rootIds`, when given,
 * restricts output to those blocks' subtrees (used to slice specific blocks).
 */
export const blocksToAiHtml = (blocks: ChaiBlock[], rootIds?: string[]): string => {
  if (!blocks || blocks.length === 0) return "";

  const byParent = new Map<string | null, ChaiBlock[]>();
  for (const block of blocks) {
    const key = (block._parent ?? null) as string | null;
    const existing = byParent.get(key);
    if (existing) existing.push(block);
    else byParent.set(key, [block]);
  }

  const roots = rootIds ? blocks.filter((b) => rootIds.includes(b._id)) : (byParent.get(null) ?? []);

  const nodes = roots.map((block) => buildNode(block, byParent));
  return preserveStyleText(stringify(nodes), (html) =>
    html
      .replace(/#styles:,/g, "#styles:")
      .replace(/\s+/g, " ")
      .trim(),
  );
};
