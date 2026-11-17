import { parseTree, TreeNode } from "~/utils/vendor/tree";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { getBlocksTree } from "~/builder/core/functions/split-blocks";
import { ChaiBlock } from "~/types/common";

// Convert the tree back to a flat array
function flattenTree(node: TreeNode<Partial<ChaiBlock>>): Partial<ChaiBlock>[] {
  const flatArray: Partial<ChaiBlock>[] = [];
  node.walk((n) => {
    delete n.model.children;
    flatArray.push(n.model);
    return true; // Continue traversal
  });
  return flatArray;
}

// Function to find a node by its _id
function findNodeById(node: TreeNode<Partial<ChaiBlock>>, id: string): TreeNode<Partial<ChaiBlock>> | null {
  return node.first((n) => n.model._id === id) || null;
}

function moveNode(
  rootNode: TreeNode<Partial<ChaiBlock>>,
  nodeIdToMove: string,
  newParentId: string,
  position: number,
): boolean {
  const nodeToMove = findNodeById(rootNode, nodeIdToMove);
  const newParentNode = findNodeById(rootNode, newParentId);
  if (!nodeToMove || !newParentNode) return false;

  if (!newParentNode.children) {
    newParentNode.model.children = [];
  }

  let currentPosition = newParentNode?.children?.findIndex((child: any) => child.model._id === nodeIdToMove);

  nodeToMove.drop();

  currentPosition = Math.max(currentPosition, 0);
  const currentParentId = nodeToMove?.model?._parent || "root";
  const newPosition = currentParentId === newParentId && currentPosition <= position ? position - 1 : position;

  try {
    newParentNode.addChildAtIndex(nodeToMove, newPosition);
  } catch (error) {
    console.error("Error adding child to parent:", error);
    return false;
  }

  return true;
}

// Process Text block logic for the old parent
function handleOldParentTextBlock(blocks: ChaiBlock[], blockToMove: ChaiBlock): ChaiBlock[] {
  if (!blockToMove || !blockToMove._parent) return blocks;

  const oldParentId = blockToMove._parent;
  const oldParent = blocks.find((block) => block._id === oldParentId);

  if (!oldParent) return blocks;

  // Get all children of the old parent
  const oldParentChildren = blocks.filter((block) => block._parent === oldParentId);

  // Check if old parent has exactly two children
  if (oldParentChildren.length === 2) {
    // Find the other child (not the one being moved)
    const otherChild = oldParentChildren.find((child) => child._id !== blockToMove._id);

    // Check if the other child is a Text block
    if (otherChild && otherChild._type === "Text" && "content" in oldParent) {
      // Copy content and content- properties from Text block to parent
      const updatedBlocks = blocks.map((block) => {
        if (block._id === oldParentId) {
          // Create updated parent with content from Text block
          const updatedBlock = { ...block, content: otherChild.content };

          // Copy any content- properties
          Object.keys(otherChild).forEach((key) => {
            if (key.startsWith("content-")) {
              (updatedBlock as any)[key] = otherChild[key];
            }
          });

          return updatedBlock;
        }
        return block;
      });

      // Remove the Text block
      return updatedBlocks.filter((block) => block._id !== otherChild._id);
    }
  }

  return blocks;
}

// Process Text block logic for the new parent
function handleNewParentTextBlock(blocks: ChaiBlock[], blockToMove: ChaiBlock, newParentId: string): ChaiBlock[] {
  if (!newParentId || newParentId === "root") return blocks;

  const newParent = blocks.find((block) => block._id === newParentId);

  if (!newParent) return blocks;

  // Check if new parent has content and no children
  if (newParent.content !== undefined && newParent.content !== "") {
    // Check if new parent has no children (except the block being moved)
    const hasOtherChildren = blocks.some((block) => block._parent === newParentId && block._id !== blockToMove._id);

    if (!hasOtherChildren) {
      // Create a new Text block with the content
      const textBlockId = generateUuid();
      const textBlock = {
        _id: textBlockId,
        _parent: newParentId,
        _type: "Text",
        content: newParent.content,
      };

      // Add content-related properties (language props)
      Object.keys(newParent).forEach((key) => {
        if (key.startsWith("content-")) {
          (textBlock as any)[key] = newParent[key];
        }
      });

      // Set content property to empty in parent block
      const updatedBlocks = blocks.map((block) => {
        if (block._id === newParentId) {
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

      // Find the index of the moved block to ensure Text block comes before it
      const movedBlockIndex = updatedBlocks.findIndex((block) => block._id === blockToMove._id);

      if (movedBlockIndex !== -1) {
        // Insert the Text block right before the moved block
        return [...updatedBlocks.slice(0, movedBlockIndex), textBlock, ...updatedBlocks.slice(movedBlockIndex)];
      } else {
        // If moved block not found (shouldn't happen), add Text block at the beginning
        return [textBlock, ...updatedBlocks];
      }
    }
  }

  return blocks;
}

function moveBlocksWithChildren(
  _blocks: ChaiBlock[],
  idToMove: string,
  newParentId: string | undefined | null,
  newPosition: number,
): ChaiBlock[] {
  if (!idToMove) return _blocks;

  // Get the block being moved
  const blockToMove = _blocks.find((block) => block._id === idToMove);
  if (!blockToMove) return _blocks;

  // Handle Text block logic for the old parent
  const processedBlocks = handleOldParentTextBlock(_blocks, blockToMove) as ChaiBlock[];

  // Set newParentId to "root" for tree model if it's null or undefined
  const treeParentId = newParentId || "root";

  const root = parseTree<Partial<ChaiBlock>>({
    _id: "root",
    children: getBlocksTree(processedBlocks),
  });

  if (moveNode(root, idToMove, treeParentId, newPosition)) {
    let newBlocks = flattenTree(root) as ChaiBlock[];
    const movedBlock = newBlocks.find((block) => block._id === idToMove);

    if (movedBlock) movedBlock._parent = treeParentId === "root" ? null : treeParentId;
    newBlocks.shift(); // Remove the root node

    // Handle Text block logic for the new parent
    if (newParentId) {
      newBlocks = handleNewParentTextBlock(newBlocks, blockToMove, newParentId);
    }

    return newBlocks;
  }
  return processedBlocks;
}

export { moveBlocksWithChildren };
