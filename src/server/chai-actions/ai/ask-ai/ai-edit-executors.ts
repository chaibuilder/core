import { canDeleteBlock } from "~/builder/core/functions/block-helpers";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { getRegisteredChaiBlocks, getRegisteredChaiBlock, syncChaiBlocksWithDefaultProps } from "~/registry";
import { hasOnlyRegisteredChaiPipes, isValidBindingTemplate, parseBindingExpression } from "~/render/binding-pipes";
import type { ChaiBlock } from "~/types/common";
import {
  getParentAndPosition,
  insertBlocksAtPosition,
  removeNestedBlocks,
  replaceBlock,
} from "~/utils/blocks-tree-ops";
import { getBlocksFromHTML, mergeBlocksWithExisting } from "~/utils/import-html/html-to-json";
import { restoreBlockPropTypes } from "~/utils/import-html/restore-block-prop-types";
import {
  rewriteInternalLinks,
  rewriteInternalLinksInProps,
  type InternalLinkResolver,
} from "~/utils/internal-link-refs";
import type { AiDataBindingPaths } from "./ai-edit-page-prompt-context";

type ImportedBlock = ChaiBlock & { _bid?: string };

export type AiEditExecutorOptions = {
  partialBlockNames?: Record<string, string | undefined>;
  validatePartialReference?: (partialBlockId: string) => string | null;
  /**
   * Two-way mapping between page paths and stable `pageType:<type>:<id>`
   * references. Slugs change; references do not — so a Link/Button href that
   * matches a page is stored as its reference, while a reference embedded in
   * text content (never resolved at render) is turned back into a path.
   */
  resolveInternalLink?: InternalLinkResolver;
  hiddenBlockTypes?: string[];
};

export type AiEditExecutorSuccess = {
  blocks: ChaiBlock[];
  newBlockIds?: string[];
  replacementBlocks?: ChaiBlock[];
  insertedBlocks?: ChaiBlock[];
  updatedBlocks?: Array<{ _id: string } & Partial<ChaiBlock>>;
  updatedBlockIds?: string[];
  parentId?: string;
  position?: number;
  removableIds?: string[];
  skippedIds?: string[];
};

export type BlockPropsUpdate = {
  blockId: string;
  props: Record<string, unknown>;
};

export type AiEditExecutorResult = AiEditExecutorSuccess | { error: string };

export const RESERVED_AI_PROPS = new Set([
  "_id",
  "_type",
  "_parent",
  "_index",
  "_name",
  "_canDelete",
  "_canMove",
  "_canDuplicate",
  "_slot",
  "__proto__",
  "constructor",
  "prototype",
]);

const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_ATTR_REGEX = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL_REGEX = /(?:java|vb)[\s\u0000-\u001f]*script[\s\u0000-\u001f]*:/gi;
const FULL_DOCUMENT_HTML_REGEX = /<!doctype\b|<\/?(?:html|head|body)\b/i;

const sanitizeString = (value: string): string =>
  value.replace(SCRIPT_TAG_REGEX, "").replace(EVENT_HANDLER_ATTR_REGEX, "").replace(SCRIPT_URL_REGEX, "");

export const sanitizeAiPropValue = (value: unknown): unknown => {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeAiPropValue);
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (!PROTOTYPE_KEYS.has(key)) sanitized[key] = sanitizeAiPropValue(nestedValue);
    }
    return sanitized;
  }
  return value;
};

export const sanitizeAiProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!RESERVED_AI_PROPS.has(key)) sanitized[key] = sanitizeAiPropValue(value);
  }
  return sanitized;
};

/** Models send null/empty/sentinel strings instead of omitting optional fields. */
export const normalizeAiParentId = (parentId: unknown): string | undefined => {
  if (typeof parentId !== "string") return undefined;
  const trimmed = parentId.trim();
  return trimmed === "" || trimmed === "undefined" || trimmed === "null" ? undefined : trimmed;
};

export const normalizeAiPosition = (position: unknown): number | undefined => {
  if (typeof position === "number") return Number.isFinite(position) ? position : undefined;
  if (typeof position === "string" && position.trim() !== "") {
    const parsed = Number(position);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getAdvertisedBindingPaths = (dataBindingPaths: AiDataBindingPaths): Set<string> => {
  const paths = new Set([...dataBindingPaths.global, ...dataBindingPaths.page]);
  for (const array of dataBindingPaths.arrays ?? []) {
    if (array.itemFields.length > 0) {
      for (const field of array.itemFields) paths.add(`$index.${field.name}`);
    } else if (array.itemType !== "object" && array.itemType !== "unknown") {
      paths.add("$index");
    }
  }
  return paths;
};

export const isValidAiBindingTemplate = (
  value: string,
  propName: string,
  dataBindingPaths?: AiDataBindingPaths,
): boolean => {
  const usage = propName === "_show" ? "visibility" : "value";
  if (!isValidBindingTemplate(value, usage)) return false;

  const trimmed = value.trim();
  const parsed = parseBindingExpression(trimmed.slice(2, -2));
  if (!hasOnlyRegisteredChaiPipes(parsed)) return false;
  if (!dataBindingPaths) return true;

  return parsed.kind !== "invalid" && getAdvertisedBindingPaths(dataBindingPaths).has(parsed.path);
};

const collectSubtree = (blocks: ChaiBlock[], rootId: string): ChaiBlock[] => {
  const childrenByParent = new Map<string, string[]>();
  for (const block of blocks) {
    if (!block._parent) continue;
    const siblings = childrenByParent.get(block._parent);
    if (siblings) siblings.push(block._id);
    else childrenByParent.set(block._parent, [block._id]);
  }

  const ids = new Set([rootId]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    for (const childId of childrenByParent.get(queue[index]) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      queue.push(childId);
    }
  }
  return blocks.filter((block) => ids.has(block._id));
};

const prepareImportedBlocks = (
  blocks: ImportedBlock[],
  options: AiEditExecutorOptions,
): { blocks: ImportedBlock[] } | { error: string } => {
  const prepared = blocks.map((block) => {
    if (block._type !== "PartialBlock" || block._name || !block.partialBlockId) return block;
    const name = options.partialBlockNames?.[block.partialBlockId];
    return name ? { ...block, _name: name } : block;
  });

  for (const block of prepared) {
    if (block._type !== "PartialBlock" && block._type !== "GlobalBlock") continue;
    const partialBlockId = String(block.partialBlockId ?? block.globalBlock ?? "");
    if (!partialBlockId) continue;
    const error = options.validatePartialReference?.(partialBlockId);
    if (error) return { error };
  }

  return {
    blocks: options.resolveInternalLink ? rewriteInternalLinks(prepared, options.resolveInternalLink) : prepared,
  };
};

const duplicateIdError = (id: string): string =>
  `The HTML contains duplicate block id "${id}". Remove the id= attribute so ids stay unique.`;

const validateAiHtml = (html: string): string | null =>
  FULL_DOCUMENT_HTML_REGEX.test(html)
    ? "Full-document HTML is not allowed. Send only the complete target element or new block markup."
    : null;

const validateImportedIds = (
  imported: ImportedBlock[],
  existingIds: Set<string>,
  collisionMessage: (id: string) => string,
): string | null => {
  const seenIds = new Set<string>();
  const seenBids = new Set<string>();
  for (const block of imported) {
    if (seenIds.has(block._id)) return duplicateIdError(block._id);
    seenIds.add(block._id);
    if (existingIds.has(block._id)) return collisionMessage(block._id);

    if (block._bid) {
      if (seenBids.has(block._bid)) return duplicateIdError(block._bid);
      seenBids.add(block._bid);
    }
  }
  return null;
};

export const applyEditBlock = async (
  blocks: ChaiBlock[],
  blockId: string,
  html: string,
  options: AiEditExecutorOptions = {},
): Promise<AiEditExecutorResult> => {
  const htmlError = validateAiHtml(html);
  if (htmlError) return { error: htmlError };
  if (!blocks.some((block) => block._id === blockId)) {
    return { error: `No block with bid "${blockId}" — call get_page_outline for valid bids.` };
  }

  const subtree = collectSubtree(blocks, blockId);
  const allowedIds = new Set(subtree.map((block) => block._id));
  const prepared = prepareImportedBlocks((await getBlocksFromHTML(html)) as ImportedBlock[], options);
  if ("error" in prepared) return prepared;
  if (prepared.blocks.length === 0) return { error: "html produced no blocks" };

  const externalBids = prepared.blocks
    .filter((block) => block._bid && !allowedIds.has(block._bid))
    .map((block) => block._bid as string);
  if (externalBids.length > 0) {
    return {
      error:
        `HTML references block ids outside "${blockId}": ${externalBids.join(", ")}. ` +
        "edit_block may only edit the target block and its descendants.",
    };
  }

  const outsideIds = new Set(blocks.filter((block) => !allowedIds.has(block._id)).map((block) => block._id));
  const collision = validateImportedIds(
    prepared.blocks,
    outsideIds,
    (id) =>
      `The HTML reuses id "${id}", which belongs to a block outside "${blockId}". ` +
      "Remove the id= attribute so a fresh id is generated.",
  );
  if (collision) return { error: collision };

  // Reattach every preserved bid before merging. Imported blocks receive fresh
  // temporary _ids, so parent pointers must be remapped with them.
  const idByImportedId = new Map(prepared.blocks.map((block) => [block._id, block._bid || block._id]));
  const reattached = prepared.blocks.map((block) => ({
    ...block,
    _id: idByImportedId.get(block._id) as string,
    _parent: block._parent ? idByImportedId.get(block._parent) || block._parent : block._parent,
  }));
  const replacementBlocks = mergeBlocksWithExisting(reattached, subtree);
  return {
    blocks: replaceBlock(blocks, blockId, replacementBlocks),
    replacementBlocks,
    newBlockIds: replacementBlocks.map((block) => block._id),
  };
};

const resolveInsertTarget = (
  blocks: ChaiBlock[],
  childType: string,
  parentId: string | undefined,
  position: number | undefined,
): { parentId?: string; position?: number } | { error: string } => {
  if (parentId && !blocks.some((block) => block._id === parentId)) {
    return { error: `No block with bid "${parentId}" — call get_page_outline for valid parent bids.` };
  }
  const resolved = getParentAndPosition(childType, blocks, [], parentId, position);
  return { parentId: resolved.parentBlockId, position: resolved.insertPosition };
};

export const applyAddBlocks = async (
  blocks: ChaiBlock[],
  html: string,
  parentIdInput?: unknown,
  positionInput?: unknown,
  options: AiEditExecutorOptions = {},
): Promise<AiEditExecutorResult> => {
  const htmlError = validateAiHtml(html);
  if (htmlError) return { error: htmlError };
  const parentId = normalizeAiParentId(parentIdInput);
  const position = normalizeAiPosition(positionInput);
  const prepared = prepareImportedBlocks((await getBlocksFromHTML(html)) as ImportedBlock[], options);
  if ("error" in prepared) return prepared;
  if (prepared.blocks.length === 0) return { error: "html produced no blocks" };

  const target = resolveInsertTarget(blocks, prepared.blocks[0]._type, parentId, position);
  if ("error" in target) return target;

  const existingIds = new Set(blocks.map((block) => block._id));
  const collision = validateImportedIds(
    prepared.blocks,
    existingIds,
    (id) =>
      `The HTML reuses id "${id}", which already exists on the page. ` +
      "Remove the id= attribute so a fresh id is generated.",
  );
  if (collision) return { error: collision };

  const insertedBlocks = prepared.blocks.map((block) => {
    const nextBlock = { ...block };
    delete nextBlock._bid;
    if (!nextBlock._parent) nextBlock._parent = target.parentId;
    return nextBlock;
  });

  return {
    blocks: insertBlocksAtPosition(blocks, insertedBlocks, target.parentId, target.position),
    insertedBlocks,
    parentId: target.parentId,
    position: target.position,
    newBlockIds: insertedBlocks.map((block) => block._id),
  };
};

const validCustomBlockTypes = (hiddenSet?: Set<string>): string[] =>
  Object.entries(getRegisteredChaiBlocks())
    .map(([registryKey, block]) => block.type ?? registryKey)
    .filter((type): type is string => typeof type === "string" && type.length > 0 && !hiddenSet?.has(type))
    .sort();

export const applyAddCustomBlock = (
  blocks: ChaiBlock[],
  type: string,
  parentIdInput?: unknown,
  positionInput?: unknown,
  props: Record<string, unknown> = {},
  options: AiEditExecutorOptions = {},
): AiEditExecutorResult => {
  const hiddenSet = Array.isArray(options.hiddenBlockTypes) ? new Set(options.hiddenBlockTypes) : undefined;
  if (hiddenSet?.has(type) || !getRegisteredChaiBlock(type)) {
    const validTypes = validCustomBlockTypes(hiddenSet);
    return {
      error: `Unknown block type "${type}". Valid types: ${validTypes.length > 0 ? validTypes.join(", ") : "none registered"}.`,
    };
  }

  const parentId = normalizeAiParentId(parentIdInput);
  const position = normalizeAiPosition(positionInput);
  const target = resolveInsertTarget(blocks, type, parentId, position);
  if ("error" in target) return target;

  const sanitizedProps = sanitizeAiProps(props);
  const rootProps = options.resolveInternalLink
    ? rewriteInternalLinksInProps(sanitizedProps, options.resolveInternalLink)
    : sanitizedProps;
  const insertedBlocks = buildCustomBlockTree(type, rootProps).map((block) =>
    block._parent ? block : { ...block, _parent: target.parentId },
  );
  return {
    blocks: insertBlocksAtPosition(blocks, insertedBlocks, target.parentId, target.position),
    insertedBlocks,
    parentId: target.parentId,
    position: target.position,
    newBlockIds: insertedBlocks.map((block) => block._id),
  };
};

/**
 * A custom block as manual Add inserts it: its registered `blocks` template (slots, starter
 * children) or the lone block, with fresh ids, `rootProps` on the root, registered defaults
 * (styles etc.) filling every prop not set, and schema-typed prop coercion applied.
 */
export const buildCustomBlockTree = (type: string, rootProps: Record<string, unknown>): ChaiBlock[] => {
  const { blocks } = (getRegisteredChaiBlock(type) ?? {}) as { blocks?: ChaiBlock[] | (() => ChaiBlock[]) };
  const template = (typeof blocks === "function" ? blocks() : blocks) ?? [];
  const templateIds = new Set(template.map((block) => block._id).filter(Boolean));
  // The root is the block of this type with no parent inside the template.
  const rootIndex = template.findIndex(
    (block) => block._type === type && !(block._parent && templateIds.has(block._parent)),
  );
  const tree =
    rootIndex < 0
      ? [{ _type: type } as ChaiBlock]
      : [template[rootIndex], ...template.filter((_, index) => index !== rootIndex)];
  // One id per block; template ids only map parents, so a missing or repeated _id can't collide.
  const newIds = tree.map(() => generateUuid());
  const idMap = new Map<string, string>();
  tree.forEach((block, index) => {
    if (block._id && !idMap.has(block._id)) idMap.set(block._id, newIds[index]);
  });
  return restoreBlockPropTypes(
    syncChaiBlocksWithDefaultProps(
      tree.map((block, index) => ({
        ...block,
        ...(index === 0 ? rootProps : {}),
        _id: newIds[index],
        _type: block._type,
        // A parent outside the template falls back to the root rather than escaping it.
        _parent: index === 0 || !block._parent ? null : (idMap.get(block._parent) ?? newIds[0]),
      })),
    ),
    { htmlBooleanEmpty: false },
  );
};

/**
 * Insert a reusable library block (either stored `ChaiBlock[]` JSON or raw HTML)
 * into a page with fresh block IDs, default props, hidden-type enforcement, and
 * internal-link rewriting. Shared by Builder AI and MCP `add_library_block`.
 */
export const applyAddLibraryBlocks = async (
  blocks: ChaiBlock[],
  libraryContent: ChaiBlock[] | string,
  parentIdInput?: unknown,
  positionInput?: unknown,
  options: AiEditExecutorOptions = {},
): Promise<AiEditExecutorResult> => {
  const rawTemplate =
    typeof libraryContent === "string"
      ? await getBlocksFromHTML(libraryContent)
      : Array.isArray(libraryContent)
        ? libraryContent
        : [];
  const validTemplate = rawTemplate.filter(
    (block): block is ChaiBlock => Boolean(block && typeof block === "object" && typeof block._type === "string"),
  );
  if (validTemplate.length === 0) {
    return { error: "Library block contains no valid blocks." };
  }

  const hiddenSet = Array.isArray(options.hiddenBlockTypes) ? new Set(options.hiddenBlockTypes) : undefined;
  if (hiddenSet) {
    const disallowed = validTemplate.find((block) => hiddenSet.has(block._type));
    if (disallowed) {
      return { error: `Library block uses "${disallowed._type}", which is not available on this site or page.` };
    }
  }

  const parentId = normalizeAiParentId(parentIdInput);
  const position = normalizeAiPosition(positionInput);
  const target = resolveInsertTarget(blocks, validTemplate[0]._type, parentId, position);
  if ("error" in target) return target;

  // Remap all internal _id / _parent pointers to fresh UUIDs so repeated insertions never collide.
  const newIds = validTemplate.map(() => generateUuid());
  const idMap = new Map<string, string>();
  validTemplate.forEach((block, index) => {
    if (block._id && !idMap.has(block._id)) idMap.set(block._id, newIds[index]);
  });

  const remapped = syncChaiBlocksWithDefaultProps(
    validTemplate.map((block, index) => {
      const next: ChaiBlock = {
        ...block,
        _id: newIds[index],
        _parent: block._parent && idMap.has(block._parent) ? idMap.get(block._parent)! : target.parentId,
      };
      delete (next as Record<string, unknown>)._bid;
      return next;
    }),
  );

  const insertedBlocks = options.resolveInternalLink
    ? rewriteInternalLinks(remapped, options.resolveInternalLink)
    : remapped;

  return {
    blocks: insertBlocksAtPosition(blocks, insertedBlocks, target.parentId, target.position),
    insertedBlocks,
    parentId: target.parentId,
    position: target.position,
    newBlockIds: insertedBlocks.map((block) => block._id),
  };
};

/**
 * Patch props on one or more existing blocks directly in `ChaiBlock[]` JSON
 * without an HTML round-trip. Validates the entire batch atomically, rejects
 * reserved structural keys, sanitizes strings/nested values, preserves `#styles:`
 * encoding on style props, rewrites internal page links, and coerces prop types
 * against each block's registered schema.
 */
export const applyUpdateBlockProps = (
  blocks: ChaiBlock[],
  updates: BlockPropsUpdate[],
  options: AiEditExecutorOptions = {},
): AiEditExecutorResult => {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { error: "update_block_props requires a non-empty updates array." };
  }

  const nextById = new Map<string, ChaiBlock>(blocks.map((block) => [block._id, block]));
  const patchById = new Map<string, Record<string, unknown>>();
  const updatedOrder: string[] = [];

  for (const entry of updates) {
    const blockId = typeof entry?.blockId === "string" ? entry.blockId.trim() : "";
    if (!blockId || !nextById.has(blockId)) {
      return { error: `No block with bid "${blockId}" — call get_page_outline for valid bids.` };
    }
    if (!entry.props || typeof entry.props !== "object" || Array.isArray(entry.props)) {
      return { error: `update_block_props requires a props object for block "${blockId}".` };
    }
    const rawKeys = Object.keys(entry.props);
    if (rawKeys.length === 0) {
      return { error: `update_block_props requires at least one prop to update for block "${blockId}".` };
    }

    for (const key of rawKeys) {
      if (RESERVED_AI_PROPS.has(key)) {
        return { error: `Cannot update reserved property "${key}" on block "${blockId}".` };
      }
    }

    const current = nextById.get(blockId)!;
    if (current._type === "PartialBlock" || current._type === "GlobalBlock") {
      const nextPartialId = entry.props.partialBlockId ?? entry.props.globalBlock;
      if (typeof nextPartialId === "string" && nextPartialId.trim().length > 0) {
        const partialErr = options.validatePartialReference?.(nextPartialId);
        if (partialErr) return { error: partialErr };
      }
    }

    const sanitized = sanitizeAiProps(entry.props);
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitized)) {
      const existingVal = current[key];
      const isStyleProp =
        (typeof existingVal === "string" && existingVal.startsWith("#styles:")) ||
        key === "styles" ||
        key.endsWith("Styles");
      if (isStyleProp && typeof value === "string") {
        const trimmed = value.trim();
        normalized[key] = trimmed.startsWith("#styles:") ? trimmed : `#styles:,${trimmed}`;
      } else {
        normalized[key] = value;
      }
    }

    const withLinks = options.resolveInternalLink
      ? rewriteInternalLinksInProps(normalized, options.resolveInternalLink)
      : normalized;

    const mergedRaw: ChaiBlock = { ...current, ...withLinks };
    const [coerced] = restoreBlockPropTypes([mergedRaw], { htmlBooleanEmpty: false });
    const updatedBlock = coerced ?? mergedRaw;
    nextById.set(blockId, updatedBlock);

    if (!patchById.has(blockId)) {
      updatedOrder.push(blockId);
      patchById.set(blockId, {});
    }
    const acc = patchById.get(blockId)!;
    for (const key of Object.keys(withLinks)) {
      acc[key] = updatedBlock[key];
    }
  }

  const nextBlocks = blocks.map((block) => nextById.get(block._id) ?? block);
  const updatedBlocks = updatedOrder.map(
    (blockId) => ({ _id: blockId, ...patchById.get(blockId)! }) as { _id: string } & Partial<ChaiBlock>,
  );

  return {
    blocks: nextBlocks,
    updatedBlocks,
    updatedBlockIds: updatedOrder,
    newBlockIds: updatedOrder,
  };
};

export const applyBindProp = (
  blocks: ChaiBlock[],
  blockId: string,
  propName: string,
  bindingPath: string,
  options: { dataBindingPaths?: AiDataBindingPaths } = {},
): AiEditExecutorResult => {
  if (!blocks.some((block) => block._id === blockId)) {
    return { error: `No block with bid "${blockId}" — call get_page_outline for valid bids.` };
  }
  if (RESERVED_AI_PROPS.has(propName)) {
    return { error: `Cannot bind reserved property "${propName}". Use a custom block prop instead.` };
  }
  if (!isValidAiBindingTemplate(bindingPath, propName, options.dataBindingPaths)) {
    return {
      error: `"${bindingPath}" is not a valid binding. Use a {{path}} or {{path | pipe}} template with an allowed data path.`,
    };
  }
  return {
    blocks: blocks.map((block) => (block._id === blockId ? { ...block, [propName]: bindingPath } : block)),
  };
};

export const applyRemoveBlocks = (blocks: ChaiBlock[], ids: string[]): AiEditExecutorResult => {
  const knownIds = new Set(blocks.map((block) => block._id));
  const uniqueIds = [...new Set(ids)];
  const removableIds = uniqueIds.filter((id) => knownIds.has(id));
  const skippedIds = uniqueIds.filter((id) => !knownIds.has(id));
  if (removableIds.length === 0) {
    return {
      error: `No blocks found for bids: ${skippedIds.join(", ")} — call get_page_outline for valid bids.`,
    };
  }
  const lockedIds = removableIds.filter((id) => !canDeleteBlock(blocks.find((block) => block._id === id)));
  if (lockedIds.length > 0) {
    return { error: `These blocks have can-delete="false" and cannot be removed: ${lockedIds.join(", ")}.` };
  }
  return {
    blocks: removeNestedBlocks(blocks, removableIds),
    removableIds,
    skippedIds,
  };
};
