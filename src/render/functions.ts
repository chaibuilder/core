import { cloneDeep, flattenDeep, get, isEmpty, last } from "lodash-es";
import { getSplitChaiClasses } from "~/builder/hooks/get-split-classes";
import { getPartialWrapperTag, MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { ChaiBlock } from "~/types/common";

/**
 * Inline partial block references with their blocks from `partials`.
 * Resolves nested partials up to MAX_PARTIAL_DEPTH levels; self-references
 * and cycles are left unexpanded so hand-authored pages can never loop
 * infinitely. Unknown ids are also left unexpanded.
 */
export function getChaiMergedPartialBlocks(
  blocks: ChaiBlock[],
  partials: Record<string, ChaiBlock[]>,
  visited: Set<string> = new Set(),
  depth: number = 0,
): ChaiBlock[] {
  if (depth >= MAX_PARTIAL_DEPTH) return blocks;

  const result: ChaiBlock[] = [];
  for (const block of blocks) {
    if (block._type !== "GlobalBlock" && block._type !== "PartialBlock") {
      result.push(block);
      continue;
    }

    const partialBlockId = get(block, "partialBlockId", get(block, "globalBlock", ""));
    if (partialBlockId === "" || visited.has(partialBlockId)) {
      result.push(block);
      continue;
    }

    let partialBlocks = cloneDeep(get(partials, partialBlockId, []));
    if (isEmpty(partialBlocks)) {
      result.push(block);
      continue;
    }

    // Hide the whole partial: do not inline (reference `_show` is dropped with the node).
    if (block._show === false) {
      continue;
    }

    // A placement with a wrapper tag stays as that element, parenting the roots.
    const hasWrapper = getPartialWrapperTag(block) !== null;

    // Re-parent roots only. Never broadcast reference `_show: true` onto children.
    partialBlocks = partialBlocks.map((b) => {
      if (isEmpty(b._parent)) b._parent = hasWrapper ? block._id : block._parent;
      return b;
    });

    const newVisited = new Set(visited);
    newVisited.add(partialBlockId);
    if (hasWrapper) result.push(block);
    result.push(...getChaiMergedPartialBlocks(partialBlocks, partials, newVisited, depth + 1));
  }

  return result;
}

/**
 * This function adds the prefix to the classes
 * @param classes
 * @param prefix
 */
export const addPrefixToClasses = (classes: string, prefix: string = "") => {
  const { classes: classesString } = getSplitChaiClasses(classes);
  const array = classesString.split(" ").map((item) => {
    const classes = item.split(" ");
    const newClasses = classes.map((item) => {
      if (item === "") return "";
      // if the class had a state of media query, then prefix the classes
      // eg: dark:hover:bg-red-500 => dark:hover:c-bg-red-500
      // eg: hover:bg-red-500 => hover:c-bg-red-500
      if (item.includes(":")) {
        const values = item.split(":");
        // replace the last value from values with prefixedClass
        values[values.length - 1] = prefix + last(values);
        return values.join(":");
      }
      return `${prefix}${item}`;
    });
    return newClasses.join(" ");
  });
  return flattenDeep(array).join(" ");
};
