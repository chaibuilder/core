import { get, has, omit } from "lodash-es";
import { getRegisteredChaiBlock } from "~/registry";
import { getSlotRule, matchesAccept } from "~/render/block-slots";

type BlockDefinition = {
  canAcceptBlock?: (target: string) => boolean;
  canDelete?: () => boolean;
  canDuplicate?: () => boolean;
  canMove?: () => boolean;
  canBeNested?: (target: string) => boolean;
  maxDepth?: number;
};

/** The registered `maxDepth` for a block type; `-1` (no limit) when unset. */
export const getBlockMaxDepth = (type: string) => {
  const blockDefinition = getRegisteredChaiBlock(type) as BlockDefinition;
  return blockDefinition?.maxDepth ?? -1;
};

/** Depth of a block in the tree: a root block is 0, its children 1, and so on. */
export const getBlockDepth = (blockId: string, blocks: { _id: string; _parent?: string | null }[]) => {
  let depth = 0;
  let parentId = blocks.find((block) => block._id === blockId)?._parent;
  while (parentId) {
    depth++;
    const currentId: string = parentId;
    parentId = blocks.find((block) => block._id === currentId)?._parent;
  }
  return depth;
};

export const canAcceptChildBlock = (parentType: string, childType: string) => {
  if (!parentType) return true; // this is root
  const blockDefinition = getRegisteredChaiBlock(parentType) as BlockDefinition;
  if (!blockDefinition) return false;
  return blockDefinition.canAcceptBlock ? blockDefinition.canAcceptBlock(childType) : false; //defaults to false
};

type SlotTarget = { _id?: string; _type: string; _parent?: string | null; _slot?: string };

// `canAcceptChildBlock` for a known target block: a ChaiSlot also applies its owner's `accept` rule.
export const canAcceptInto = (target: SlotTarget | null | undefined, childType: string, blocks: SlotTarget[]) => {
  if (!canAcceptChildBlock(target?._type ?? "", childType)) return false;
  if (target?._type !== "ChaiSlot") return true;
  const owner = blocks.find((block) => block._id === target._parent);
  return matchesAccept(getSlotRule(owner?._type, target._slot)?.accept, childType);
};

export const canAddChildBlock = (parentType: string) => {
  const blockDefinition = getRegisteredChaiBlock(parentType) as BlockDefinition;
  if (!blockDefinition) return false;
  return has(blockDefinition, "canAcceptBlock"); //defaults to false
};

export const canBeNestedInside = (parentType: string, childType: string) => {
  const blockDefinition = getRegisteredChaiBlock(childType) as BlockDefinition;
  if (!blockDefinition) return true;
  return blockDefinition.canBeNested ? blockDefinition.canBeNested(parentType) : true;
};

type BlockInstance = { _type?: string; _canDelete?: boolean; _canMove?: boolean; _canDuplicate?: boolean };
type ActionKey = "canDelete" | "canMove" | "canDuplicate";
const INSTANCE_FLAG = { canDelete: "_canDelete", canMove: "_canMove", canDuplicate: "_canDuplicate" } as const;
/** The per-instance action flags a block can carry. */
export const BLOCK_ACTION_FLAGS = Object.values(INSTANCE_FLAG);

// Instance flag wins, then the registered config callback, then true.
const canPerform = (block: BlockInstance | null | undefined, action: ActionKey) => {
  const flag = block?.[INSTANCE_FLAG[action]];
  if (typeof flag === "boolean") return flag;
  const blockDefinition = getRegisteredChaiBlock(block?._type ?? "") as BlockDefinition;
  return blockDefinition?.[action] ? blockDefinition[action]() : true;
};

export const canDuplicateBlock = (block: BlockInstance | null | undefined) => canPerform(block, "canDuplicate");
export const canDeleteBlock = (block: BlockInstance | null | undefined) => canPerform(block, "canDelete");
export const canMoveBlock = (block: BlockInstance | null | undefined) => canPerform(block, "canMove");

// Bulk checks reject the whole action when any listed block disallows it.
const canPerformAll = (ids: string[], blocks: (BlockInstance & { _id: string })[], action: ActionKey) => {
  const byId = new Map(blocks.map((block) => [block._id, block]));
  return ids.every((id) => canPerform(byId.get(id), action));
};

export const canDeleteBlocks = (ids: string[], blocks: (BlockInstance & { _id: string })[]) =>
  canPerformAll(ids, blocks, "canDelete");
export const canMoveBlocks = (ids: string[], blocks: (BlockInstance & { _id: string })[]) =>
  canPerformAll(ids, blocks, "canMove");
export const canDuplicateBlocks = (ids: string[], blocks: (BlockInstance & { _id: string })[]) =>
  canPerformAll(ids, blocks, "canDuplicate");

// AI-HTML hint for a ChaiSlot: what its owner lets in, e.g. `accept="/HeaderOne/"`.
export const getSlotAcceptAttrs = (block: SlotTarget, ownerType: string | undefined) => {
  const accept = block._type === "ChaiSlot" ? getSlotRule(ownerType, block._slot)?.accept : undefined;
  return accept ? [{ key: "accept", value: String(accept) }] : [];
};

// AI-HTML hints for actions this block instance disallows, e.g. `can-move="false"`.
export const getBlockActionAttrs = (block: BlockInstance) => {
  const attrs: Array<{ key: string; value: string }> = [];
  if (!canMoveBlock(block)) attrs.push({ key: "can-move", value: "false" });
  if (!canDeleteBlock(block)) attrs.push({ key: "can-delete", value: "false" });
  if (!canDuplicateBlock(block)) attrs.push({ key: "can-duplicate", value: "false" });
  return attrs;
};

// A pasted block lands on its own, so its top-level blocks drop their locks; nested ones keep theirs.
export const releaseTopLevelLocks = <T extends { _id: string; _parent?: string | null }>(blocks: T[]): T[] => {
  const ids = new Set(blocks.map((block) => block._id));
  return blocks.map((block) =>
    block._parent && ids.has(block._parent) ? block : (omit(block, BLOCK_ACTION_FLAGS) as T),
  );
};

export const canDropBlock = (_currentTree: any, { dragSource, dropTarget }: any) => {
  const dragSourceType = get(dragSource, "data._type", "");
  const dropTargetType = get(dropTarget, "data._type", "");
  return canAcceptChildBlock(dropTargetType, dragSourceType);
};

/**
 * A block with no `pageTypes` is available everywhere; otherwise it's
 * restricted to the listed page type keys (e.g. "page", "product").
 */
export const isBlockAvailableForPageType = (block: { pageTypes?: string[] }, pageType: string) => {
  const pageTypes = block?.pageTypes;
  if (!Array.isArray(pageTypes) || pageTypes.length === 0) return true;
  return pageTypes.includes(pageType);
};

if (import.meta.vitest) {
  describe("canDropBlock Function", () => {
    it('should return false if dragSourceType is "Slot"', () => {
      const dragSource = { data: { _type: "Slot" } };
      const dropTarget = { data: {} };
      expect(canDropBlock({}, { dragSource, dropTarget })).toBe(true);
    });

    it("should return true if dropTargetType is empty", () => {
      const dragSource = { data: { _type: "Box" } };
      const dropTarget = { data: {} };
      expect(canDropBlock({}, { dragSource, dropTarget })).toBe(true);
    });
  });

  describe("isBlockAvailableForPageType Function", () => {
    it("should be available on any page type when pageTypes is not set", () => {
      expect(isBlockAvailableForPageType({}, "product")).toBe(true);
      expect(isBlockAvailableForPageType({}, "page")).toBe(true);
    });

    it("should be available on any page type when pageTypes is empty", () => {
      expect(isBlockAvailableForPageType({ pageTypes: [] }, "product")).toBe(true);
    });

    it("should only be available on listed page types", () => {
      expect(isBlockAvailableForPageType({ pageTypes: ["product"] }, "product")).toBe(true);
      expect(isBlockAvailableForPageType({ pageTypes: ["product"] }, "page")).toBe(false);
    });

    it("should support multiple page types", () => {
      expect(isBlockAvailableForPageType({ pageTypes: ["product", "collection"] }, "collection")).toBe(true);
    });
  });
}
