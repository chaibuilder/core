import { canDeleteBlock } from "~/builder/core/functions/block-helpers";
import { generateUUID } from "~/builder/core/functions/common-functions";
import { getAllRegisteredChaiBlocks, getRegisteredChaiBlock } from "~/registry";
import { hasOnlyRegisteredChaiPipes, isValidBindingTemplate, parseBindingExpression } from "~/render/binding-pipes";
import type { ChaiBlock } from "~/types/common";
import {
  getParentAndPosition,
  insertBlocksAtPosition,
  removeNestedBlocks,
  replaceBlock,
} from "~/utils/blocks-tree-ops";
import { getBlocksFromHTML, mergeBlocksWithExisting } from "~/utils/import-html/html-to-json";
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
};

export type AiEditExecutorSuccess = {
  blocks: ChaiBlock[];
  newBlockIds?: string[];
  replacementBlocks?: ChaiBlock[];
  insertedBlocks?: ChaiBlock[];
  parentId?: string;
  position?: number;
  removableIds?: string[];
  skippedIds?: string[];
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

const validCustomBlockTypes = (): string[] =>
  Object.entries(getAllRegisteredChaiBlocks())
    .map(([registryKey, block]) => block.type ?? registryKey)
    .filter((type): type is string => typeof type === "string" && type.length > 0)
    .sort();

export const applyAddCustomBlock = (
  blocks: ChaiBlock[],
  type: string,
  parentIdInput?: unknown,
  positionInput?: unknown,
  props: Record<string, unknown> = {},
  options: AiEditExecutorOptions = {},
): AiEditExecutorResult => {
  if (!getRegisteredChaiBlock(type)) {
    const validTypes = validCustomBlockTypes();
    return {
      error: `Unknown block type "${type}". Valid types: ${validTypes.length > 0 ? validTypes.join(", ") : "none registered"}.`,
    };
  }

  const parentId = normalizeAiParentId(parentIdInput);
  const position = normalizeAiPosition(positionInput);
  const target = resolveInsertTarget(blocks, type, parentId, position);
  if ("error" in target) return target;

  const sanitizedProps = sanitizeAiProps(props);
  const block: ChaiBlock = {
    _id: generateUUID(),
    _type: type,
    _parent: target.parentId,
    ...(options.resolveInternalLink
      ? rewriteInternalLinksInProps(sanitizedProps, options.resolveInternalLink)
      : sanitizedProps),
  };
  return {
    blocks: insertBlocksAtPosition(blocks, [block], target.parentId, target.position),
    insertedBlocks: [block],
    parentId: target.parentId,
    position: target.position,
    newBlockIds: [block._id],
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
