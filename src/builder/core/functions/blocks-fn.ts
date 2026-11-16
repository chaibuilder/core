import { filter, find, flatten, has } from "lodash-es";
import { generateUUID } from "~/builder/core/functions/common-functions";
import { ChaiBlock } from "~/types/common";

export type ChaiBlockStructureEntry = { _id: string; _type: string; _slot?: string };
export type ChaiBlockChildrenMap = Map<string | null, ChaiBlockStructureEntry[]>;

/**
 * Groups blocks by parent id (null for root blocks), keeping only structural
 * fields. Used to render/re-render the canvas tree without depending on block props.
 */
export const buildBlockChildrenMap = (blocks: ChaiBlock[]): ChaiBlockChildrenMap => {
  const childrenMap: ChaiBlockChildrenMap = new Map();
  blocks.forEach((block) => {
    if (!has(block, "_id")) return;
    const parent = block._parent || null;
    let siblings = childrenMap.get(parent);
    if (!siblings) {
      siblings = [];
      childrenMap.set(parent, siblings);
    }
    siblings.push({ _id: block._id, _type: block._type, ...(block._slot && { _slot: block._slot }) });
  });
  return childrenMap;
};

export const blockChildrenMapsEqual = (a: ChaiBlockChildrenMap, b: ChaiBlockChildrenMap): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [parent, aChildren] of a) {
    const bChildren = b.get(parent);
    if (!bChildren || bChildren.length !== aChildren.length) return false;
    for (let i = 0; i < aChildren.length; i++) {
      if (
        aChildren[i]._id !== bChildren[i]._id ||
        aChildren[i]._type !== bChildren[i]._type ||
        aChildren[i]._slot !== bChildren[i]._slot
      )
        return false;
    }
  }
  return true;
};

export const nestedToFlatArray = (nestedJson: Array<ChaiBlock>, parent: string | null = null): Array<ChaiBlock> =>
  flatten(
    nestedJson.map((block: any) => {
      block = parent !== null ? { ...block, _parent: parent } : block;
      if (block.children && block.children.length) {
        const children = [...block.children];

        delete block.children;
        return flatten([block, ...nestedToFlatArray(children, block._id)]);
      }
      return block;
    }),
  );

export function duplicateBlocks(
  blocks: Partial<ChaiBlock>[],
  id: string,
  _parent: string | null,
): Partial<ChaiBlock>[] {
  const children = filter(blocks, (c) => c._parent === id);
  const newBlocks: Array<any> = [];
  for (let i = 0; i < children.length; i++) {
    if (filter(blocks, { _parent: children[i]._id }).length > 0) {
      const newId = generateUUID();
      newBlocks.push({
        ...children[i],
        oldId: children[i]._id,
        ...{ _id: newId, _parent },
      });
      newBlocks.push(flatten(duplicateBlocks(blocks, children[i]._id!, newId)));
    } else {
      newBlocks.push({
        ...children[i],
        oldId: children[i]._id,
        ...{ _id: generateUUID(), _parent },
      });
    }
  }
  return flatten(newBlocks);
}

export function convertToBlocksTree(blocks: ChaiBlock[]) {
  // Create a map to store nodes by their ids
  const idMap: Record<string, any> = {};
  blocks.forEach((item) => {
    idMap[item._id] = { ...item, children: [] };
  });

  // Create the result array to store top level nodes
  const result: any[] = [];

  blocks.forEach((item) => {
    if (item._parent) {
      // If the item has a parent, find the parent and add the node to its children
      const parent = idMap[item._parent];
      if (parent) {
        parent.children.push(idMap[item._id]);
      }
    } else {
      // If the item has no parent, it is a top level node
      result.push(idMap[item._id]);
    }
  });

  return result;
}

/**
 * Return the cloned array of blocks
 * @param currentBlocks
 * @param id
 * @param newParentId
 */
export const getDuplicatedBlocks = (
  currentBlocks: Partial<ChaiBlock>[],
  id: string,
  newParentId: string | null = null,
): ChaiBlock[] => {
  let block = find(currentBlocks, { _id: id }) as ChaiBlock;
  block = { ...block, oldId: block._id, _id: generateUUID() } as ChaiBlock;

  if (newParentId !== block?._parent) {
    block = { ...block, _parent: newParentId as string };
  }

  const blocks: ChaiBlock[] = [block];

  if (filter(currentBlocks, { _parent: id }).length > 0) {
    // @ts-expect-error - flatten result may not match ChaiBlock[] exactly
    blocks.push(flatten(duplicateBlocks(currentBlocks, id, block._id)));
  }

  return flatten(blocks);
};
