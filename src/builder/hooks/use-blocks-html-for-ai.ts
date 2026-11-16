import { parse, stringify } from "himalaya";
import { kebabCase } from "lodash-es";
import { useCallback } from "react";
import { getCurrentBlocks } from "~/builder/atoms/store";
import { canAddChildBlock, getBlockActionAttrs, getSlotAcceptAttrs } from "~/builder/core/functions/block-helpers";
import { useCanvasIframe } from "~/builder/hooks/use-canvas-iframe";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types";
import { CORE_BLOCKS } from "~/utils/core-blocks";
import {
  encodeStyleText,
  preserveStyleText,
  STYLE_TEXT_ENCODING,
  STYLE_TEXT_ENCODING_ATTR,
} from "~/utils/style-text-transport";

export type HimalayaNode = {
  type: "element" | "text" | "comment";
  tagName?: string;
  attributes?: Array<{ key: string; value: string }>;
  children?: HimalayaNode[];
  content?: string;
};

type Options = {
  blockId?: string;
  additionalCoreBlocks?: string[];
};

// Never exported as attributes; action flags are re-emitted as resolved `can-*` hints.
const STRUCTURAL_KEYS = ["_id", "_type", "_parent", "_index", "_canDelete", "_canMove", "_canDuplicate"];

const ATTRIBUTES_TO_REMOVE = [
  "data-block-index",
  "draggable",
  "data-drop",
  "data-style-id",
  "data-block-parent",
  "data-style-prop",
  "data-highlighted",
];

const cleanNode = (node: HimalayaNode): HimalayaNode | null => {
  // Remove script, style, and link tags. A <style> that is a block (carries
  // data-block-id) is page content and must reach the AI; canvas-injected
  // <style>/<link> tags (Tailwind, fonts) have no block id and stay dropped.
  if (node.type === "element" && ["script", "style", "link"].includes(node.tagName || "")) {
    const isStyleBlock =
      node.tagName === "style" && node.attributes?.some((attr) => attr.key === "data-block-id" && attr.value);
    if (!isStyleBlock) return null;
  }

  if (node.type === "comment") {
    return null;
  }

  // Keep text and comment nodes as is
  if (node.type === "text") {
    return node;
  }

  // if id is add-block-bottom, remove it
  if (
    node.type === "element" &&
    node.attributes &&
    node.attributes.find((attr) => attr.key === "id" && attr.value === "add-block-bottom")
  ) {
    return null;
  }

  // Clean attributes for element nodes
  if (node.type === "element" && node.attributes) {
    node.attributes = node.attributes.filter((attr) => !ATTRIBUTES_TO_REMOVE.includes(attr.key));
  }

  // Recursively clean children
  if (node.children) {
    node.children = node.children.map(cleanNode).filter((child): child is HimalayaNode => child !== null);
  }

  return node;
};

// The child blocks inside a custom block's rendered markup, without the markup around them.
const findChildBlockNodes = (nodes: HimalayaNode[] = []): HimalayaNode[] =>
  nodes.flatMap((child) =>
    child.type !== "element"
      ? []
      : child.attributes?.some((attr) => attr.key === "data-block-type")
        ? [child]
        : findChildBlockNodes(child.children),
  );

export const transformNode = (node: HimalayaNode, currentBlocks: ChaiBlock[], options: Options = {}): HimalayaNode => {
  // Only process element nodes
  if (node.type !== "element" || !node.attributes) {
    return node;
  }

  // Convert span with role="link" to anchor tag
  if (node.tagName === "span") {
    const roleAttr = node.attributes.find((attr) => attr.key === "role" && attr.value === "link");
    if (roleAttr) {
      node.tagName = "a";
      // Remove the role attribute
      node.attributes = node.attributes.filter((attr) => attr.key !== "role");

      // Adding link config
      const blockId = node.attributes.find((attr) => attr.key === "data-block-id")?.value;
      const linkBlock = currentBlocks?.find((block) => block?._id === blockId);
      if (linkBlock?.link && linkBlock?.link?.href?.length > 0) {
        const href = linkBlock?.link?.href;
        const target = linkBlock?.link?.target;
        node.attributes.push({ key: "href", value: href });
        if (typeof target === "string" && target.length > 0) {
          node.attributes.push({ key: "target", value: target });
        }
      }
    }
  }

  // Style block: CSS is raw text. Re-emit it from the stored Text children
  // (the canvas may wrap it in <span>) in the entity-encoded transport form
  // that html-to-json decodes.
  if (node.tagName === "style") {
    const styleId = node.attributes.find((attr) => attr.key === "data-block-id")?.value;
    const css = currentBlocks
      .filter((block) => block._parent === styleId && block._type === "Text")
      .map((block) => String((block as ChaiBlock & { content?: string }).content ?? ""))
      .join("");
    node.children = css ? [{ type: "text", content: encodeStyleText(css) }] : [];
    node.attributes = node.attributes.filter((attr) => attr.key !== STYLE_TEXT_ENCODING_ATTR);
    node.attributes.push({ key: STYLE_TEXT_ENCODING_ATTR, value: STYLE_TEXT_ENCODING });
  }

  // Find data-block-type attribute
  const blockTypeAttr = node.attributes.find((attr) => attr.key === "data-block-type");
  const blockIdAttr = node.attributes.find((attr) => attr.key === "data-block-id");

  if (blockTypeAttr) {
    const blockType = blockTypeAttr.value;

    if (CORE_BLOCKS.includes(blockType) || options?.additionalCoreBlocks?.includes(blockType)) {
      // For core blocks, just remove the data-block-type attribute
      node.attributes = node.attributes.filter((attr) => attr.key !== "data-block-type");
      const coreBlock = currentBlocks.find((block) => block._id === blockIdAttr?.value);
      if (coreBlock) node.attributes.push(...getBlockActionAttrs(coreBlock));

      // Recursively transform children for core blocks
      if (node.children) {
        node.children = node.children.map((node) => transformNode(node, currentBlocks, options));
      }
    } else {
      // For custom blocks, convert to web component style tag
      const customTagName = `chai-${kebabCase(blockType)}`;

      // Create new node with custom tag name
      node.tagName = customTagName;

      // Reset attributes — block props are re-emitted below, and the
      // original `data-block-id` is later mapped to `bid` for round-trip
      // identity (used by mergeBlocksWithExisting on import).
      node.attributes = [];
      node.attributes.push({ key: "chai-type", value: blockType });

      // Re-emit block props as attributes. Internal-only keys
      // (_id/_type/_parent/_index) are stripped because they're either
      // reconstructed from the DOM tree on import or come back via `bid`.
      // _name IS exported so block names survive the round-trip.
      const blockDefinition = getRegisteredChaiBlock(blockType);
      const block = currentBlocks.find((block) => block._id === blockIdAttr?.value);
      if (block) {
        node.attributes.push(
          ...Object.entries(block)
            // A prop left behind as undefined (e.g. a cleared form field) would
            // serialize to `undefined`, and himalaya's stringify calls
            // value.indexOf on it — dropping the attribute is the same as unset.
            .filter(([key, value]) => !STRUCTURAL_KEYS.includes(key) && value !== undefined)
            .map(([key, value]) => {
              // Convert camelCase keys to kebab-case so HTML parser lowercasing is lossless.
              // _prefixed keys: kebab the part after the underscore (e.g. _imageId -> _image-id)
              // Regular keys: full kebab (e.g. mobileImage -> mobile-image)
              const attrKey = key.startsWith("_") ? "_" + kebabCase(key.slice(1)) : kebabCase(key);
              return {
                key: attrKey,
                value: typeof value === "string" ? value : JSON.stringify(value),
              };
            }),
        );
      }
      if (blockDefinition && blockDefinition?.description) {
        node.attributes.push({
          key: "about-this-component",
          value: blockDefinition.description,
        });
      }

      // Resolved per-instance action hints (can-move/can-delete/can-duplicate)
      if (block) {
        node.attributes.push(...getBlockActionAttrs(block));
        const ownerType = currentBlocks.find((owner) => owner._id === block._parent)?._type;
        node.attributes.push(...getSlotAcceptAttrs(block, ownerType));
      }

      // Icon blocks: strip the raw SVG and replace with a Lucide icon name
      // when extractable, so the AI knows which icon is used.
      if (blockType === "Icon") {
        const iconAttr = node.attributes.find((attr) => attr.key === "icon");
        const svg = iconAttr?.value ?? "";
        const isDefault = svg.includes("chai-default-svg");
        node.attributes = node.attributes.filter((attr) => attr.key !== "icon");
        if (!isDefault) {
          // SVGs may carry both `lucide-{name}-icon` and `lucide-{name}`.
          // Collect all tokens and prefer the one without a `-icon` suffix.
          const tokens = svg.match(/\blucide-([\w-]+)\b/g);
          if (tokens) {
            const names = tokens.map((t) => t.replace("lucide-", ""));
            const name = names.find((n) => !n.endsWith("-icon")) ?? names[0].replace(/-icon$/, "");
            node.attributes.push({ key: "icon-name", value: name });
          }
        }
      }

      // Check if custom block can accept children using the helper function
      // This properly checks if canAcceptBlock is defined in the block definition
      if (canAddChildBlock(blockType)) {
        // Only its child blocks: the component's own markup is rebuilt from its props.
        node.children = findChildBlockNodes(node.children).map((child) => transformNode(child, currentBlocks, options));
      } else {
        // Remove all children for custom blocks that don't accept children
        node.children = [];
      }
    }
  } else {
    // For nodes without data-block-type, recursively transform children
    if (node.children) {
      node.children = node.children.map((node) => transformNode(node, currentBlocks, options));
    }
  }

  //remove data-block-type and data-block-id attributes
  // Convert data-block-id to bid before removing
  if (blockIdAttr) {
    node.attributes.push({ key: "bid", value: blockIdAttr.value });
  }
  node.attributes = node.attributes.filter((attr) => attr.key !== "data-block-type" && attr.key !== "data-block-id");

  return node;
};

/** Canvas HTML -> AI-HTML. Exported for tests. */
export const canvasHtmlToAiHtml = (html: string, currentBlocks: ChaiBlock[], options?: Options): string => {
  // Parse HTML into AST
  const nodes = parse(html) as HimalayaNode[];

  // Clean nodes
  const cleanedNodes = nodes.map(cleanNode).filter((node): node is HimalayaNode => node !== null);

  // Transform nodes: remove data-block-type for core blocks, convert custom blocks to web components
  const transformedNodes = cleanedNodes.map((node) => transformNode(node, currentBlocks, options));

  // Convert back to HTML and normalize whitespace (never inside <style>)
  return preserveStyleText(stringify(transformedNodes), (out) =>
    out.replace(/#styles:,/g, "#styles:").replace(/\s+/g, " ").trim(),
  );
};

export const useBlocksHtmlForAi = () => {
  const [iframeDocument] = useCanvasIframe();
  return useCallback(
    (options?: Options) => {
      if (!iframeDocument) return "";
      const id = options?.blockId ? `[data-block-id="${options.blockId}"]` : "#canvas";
      const html = (iframeDocument as HTMLIFrameElement).contentDocument?.querySelector(id)?.[
        id === "#canvas" ? "innerHTML" : "outerHTML"
      ];
      if (!html) return "";

      return canvasHtmlToAiHtml(html, getCurrentBlocks(), options);
    },
    [iframeDocument],
  );
};
