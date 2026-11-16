import { atom, PrimitiveAtom } from "jotai";
import { selectAtom, splitAtom } from "jotai/utils";
import { filter, has, isEqual, pick } from "lodash-es";
import {
  blockChildrenMapsEqual,
  buildBlockChildrenMap,
  convertToBlocksTree,
} from "~/builder/core/functions/blocks-fn";
import { StructureError } from "~/builder/hooks/structure-rules";
import { ChaiBlock } from "~/types/common";

// derived atoms
export const presentBlocksAtom = atom<ChaiBlock[]>([]);
presentBlocksAtom.debugLabel = "presentBlocksAtom";

// Fields the outline panel renders. Keeping the projection this narrow (with an
// equality guard) means typing in other block props doesn't rebuild the tree.
// `partialBlockId` / `globalBlock` ride along so the outline can flag a partial
// whose page was deleted outside the builder.
const OUTLINE_BLOCK_FIELDS = [
  "_id",
  "_parent",
  "_type",
  "_name",
  "_canMove",
  "tag",
  "_show",
  "_libBlockId",
  "partialBlockId",
  "globalBlock",
];

const outlineBlocksAtom = selectAtom(
  presentBlocksAtom,
  (blocks) => blocks.map((block) => pick(block, OUTLINE_BLOCK_FIELDS) as ChaiBlock),
  (a, b) => a.length === b.length && a.every((block, i) => isEqual(block, b[i])),
);
outlineBlocksAtom.debugLabel = "outlineBlocksAtom";

//TODO: Need a better name for this atom. Also should be a custom hook
export const treeDSBlocks = atom((get) => {
  return convertToBlocksTree(get(outlineBlocksAtom));
});
treeDSBlocks.debugLabel = "treeDSBlocks";

export const pageBlocksAtomsAtom = splitAtom(presentBlocksAtom);
pageBlocksAtomsAtom.debugLabel = "pageBlocksAtomsAtom";

// id -> block atom index. splitAtom keeps its atoms index-aligned with presentBlocksAtom,
// so a single O(n) pass here replaces the O(n) find() previously done per block access.
export const blockAtomsMapAtom = atom((get) => {
  const blocks = get(presentBlocksAtom);
  const atoms = get(pageBlocksAtomsAtom);
  const blockAtomsMap = new Map<string, PrimitiveAtom<ChaiBlock>>();
  blocks.forEach((block, index) => blockAtomsMap.set(block._id, atoms[index]));
  return blockAtomsMap;
});
blockAtomsMapAtom.debugLabel = "blockAtomsMapAtom";

// Structure-only view of the page blocks (parent -> ordered children ids/types).
// The equality guard keeps the value identity stable across prop-only edits, so
// structure subscribers (canvas tree, outline) don't re-render on every keystroke.
export const blockChildrenMapAtom = selectAtom(presentBlocksAtom, buildBlockChildrenMap, blockChildrenMapsEqual);
blockChildrenMapAtom.debugLabel = "blockChildrenMapAtom";

export const hasPageBlocksAtom = atom((get) => get(presentBlocksAtom).length > 0);
hasPageBlocksAtom.debugLabel = "hasPageBlocksAtom";

export const builderActivePageAtom = atom<string>("");
builderActivePageAtom.debugLabel = "builderActivePageAtom";

export const destinationDropIndexAtom = atom<number>(-1);
destinationDropIndexAtom.debugLabel = "destinationDropIndexAtom";

export const buildingBlocksAtom: any = atom<Array<any>>([]);
buildingBlocksAtom.debugLabel = "buildingBlocksAtom";

export const globalBlocksAtom = atom<Array<any>>((get) => {
  const globalBlocks = get(buildingBlocksAtom) as Array<any>;
  return filter(globalBlocks, (block) => has(block, "blockId"));
});
globalBlocksAtom.debugLabel = "globalBlocksAtom";

// Structure validation atoms
export const structureErrorsAtom = atom<StructureError[]>([]);
structureErrorsAtom.debugLabel = "structureErrorsAtom";

export const structureValidationValidAtom = atom<boolean>(true);
structureValidationValidAtom.debugLabel = "structureValidationValidAtom";

export const hasStructureErrorsAtom = atom<boolean>(false);
hasStructureErrorsAtom.debugLabel = "hasStructureErrorsAtom";

export const hasStructureWarningsAtom = atom<boolean>(false);
hasStructureWarningsAtom.debugLabel = "hasStructureWarningsAtom";

// Derived atoms for computed values
export const structureErrorCountAtom = atom<number>((get) => {
  const errors = get(structureErrorsAtom);
  return errors.filter((e) => e.severity === "error").length;
});
structureErrorCountAtom.debugLabel = "structureErrorCountAtom";

export const structureWarningCountAtom = atom<number>((get) => {
  const errors = get(structureErrorsAtom);
  return errors.filter((e) => e.severity === "warning").length;
});
structureWarningCountAtom.debugLabel = "structureWarningCountAtom";

export const structureErrorsByBlockAtom = atom<Record<string, StructureError[]>>((get) => {
  const errors = get(structureErrorsAtom);
  const errorsByBlock: Record<string, StructureError[]> = {};

  errors.forEach((error) => {
    if (error.blockId) {
      if (!errorsByBlock[error.blockId]) {
        errorsByBlock[error.blockId] = [];
      }
      errorsByBlock[error.blockId].push(error);
    }
  });

  return errorsByBlock;
});
structureErrorsByBlockAtom.debugLabel = "structureErrorsByBlockAtom";
