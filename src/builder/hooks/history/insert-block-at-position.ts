import { generateUuid } from "~/builder/core/functions/common-functions";
import { ChaiBlock } from "~/types/common";

export function insertBlocksAtPosition(
  allBlocks: ChaiBlock[],
  newBlocks: ChaiBlock[],
  parentId?: string,
  position?: number,
): ChaiBlock[] {
  // Process new blocks
  const processedNewBlocks = [...newBlocks];

  // Create a modified version of allBlocks to return
  let modifiedAllBlocks = [...allBlocks];

  // Check if parent has content and no children
  if (parentId) {
    const parentBlock = allBlocks.find((block) => block._id === parentId);

    if (parentBlock && parentBlock.content !== undefined && parentBlock.content !== "") {
      // Check if parent has no children
      const hasChildren = allBlocks.some((block) => block._parent === parentId);

      if (!hasChildren) {
        // Create a new Text block with the content
        const textBlockId = generateUuid();
        const textBlock = {
          _id: textBlockId,
          _parent: parentId,
          _type: "Text",
          content: parentBlock.content,
        };

        // Add content-related properties (language props)
        Object.keys(parentBlock).forEach((key) => {
          if (key.startsWith("content-")) {
            (textBlock as any)[key] = parentBlock[key];
          }
        });

        // Add the new Text block at the start of the processed blocks
        processedNewBlocks.unshift(textBlock);

        // Set content property to empty in parent block
        modifiedAllBlocks = modifiedAllBlocks.map((block) => {
          if (block._id === parentId) {
            // Create a new object with empty content
            const updatedBlock = { ...block, content: "" };

            // Also set content- properties to empty strings
            Object.keys(updatedBlock).forEach((key) => {
              if (key.startsWith("content-")) {
                (updatedBlock as any)[key] = "";
              }
            });

            return updatedBlock;
          }
          return block;
        });
      }
    }
  }

  // If no parentId is provided, append new blocks to the end of top-level blocks
  let parentBlocks = modifiedAllBlocks.filter((block) => !block._parent);

  if (parentId) {
    // Filter the blocks that belong to the specified parent
    parentBlocks = modifiedAllBlocks.filter((block) => block._parent === parentId);
  }

  // Determine the position to insert the new blocks
  const insertPosition =
    position !== undefined && !isNaN(position) && position > -1
      ? Math.min(position, parentBlocks.length)
      : parentBlocks.length;

  // Find the correct index in the allBlocks array to insert the new blocks
  let insertIndex = modifiedAllBlocks.length;
  for (let i = 0, count = 0; i < modifiedAllBlocks.length; i++) {
    if (parentId !== undefined ? modifiedAllBlocks[i]._parent === parentId : !modifiedAllBlocks[i]._parent) {
      if (count === insertPosition) {
        insertIndex = i;
        break;
      }
      count++;
    }
  }

  // If no parentId is specified and position is greater than top-level blocks count
  if (!parentId && position !== undefined && position >= parentBlocks.length) {
    insertIndex = modifiedAllBlocks.length;
  }

  // Insert the new blocks at the specified position within the parent block
  return [
    ...modifiedAllBlocks.slice(0, insertIndex),
    ...processedNewBlocks,
    ...modifiedAllBlocks.slice(insertIndex),
  ] as ChaiBlock[];
}
