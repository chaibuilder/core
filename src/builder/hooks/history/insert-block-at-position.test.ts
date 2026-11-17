import * as Functions from "~/builder/core/functions/common-functions";
import { insertBlocksAtPosition } from "~/builder/hooks/history/insert-block-at-position";
import { ChaiBlock } from "~/types/common";

const BLOCK_1 = { _id: "1", _type: "Text" };

const BLOCK_2 = { _id: "2", _type: "Text" };
const BLOCK_2_1 = { _id: "2_1", _parent: "2", _type: "Text" };
const BLOCK_2_2 = { _id: "2_2", _parent: "2", _type: "Text" };
const BLOCK_2_ALL = [BLOCK_2, BLOCK_2_1, BLOCK_2_2];

const BLOCK_3 = { _id: "3", _type: "Text" };
// const BLOCK_3_1 = { _id: "3_1", _parent: "3" };
// const BLOCK_3_2 = { _id: "3_2", _parent: "3" };
// const BLOCK_3_ALL = [BLOCK_3, BLOCK_3_1, BLOCK_3_2];

describe("insertBlocksAtPosition", () => {
  test("insertBlocksAtPosition", () => {
    expect(insertBlocksAtPosition([], [BLOCK_1])).toEqual([BLOCK_1]);
    expect(insertBlocksAtPosition([BLOCK_1], [BLOCK_2, BLOCK_2_1])).toEqual([BLOCK_1, BLOCK_2, BLOCK_2_1]);

    expect(insertBlocksAtPosition([BLOCK_1, ...BLOCK_2_ALL], [BLOCK_3], "2", 1)).toEqual([
      BLOCK_1,
      BLOCK_2,
      BLOCK_2_1,
      BLOCK_3,
      BLOCK_2_2,
    ]);

    expect(insertBlocksAtPosition([BLOCK_1, BLOCK_2], [BLOCK_3], undefined, 1)).toEqual([BLOCK_1, BLOCK_3, BLOCK_2]);
    expect(insertBlocksAtPosition([BLOCK_1, ...BLOCK_2_ALL], [BLOCK_3], "2")).toEqual([
      BLOCK_1,
      BLOCK_2,
      BLOCK_2_1,
      BLOCK_2_2,
      BLOCK_3,
    ]);
  });

  test("should create Text block when parent has content and no children", () => {
    // Mock the generateUUID function to return a predictable ID for testing
    vi.spyOn(Functions, "generateUuid").mockReturnValue("text_block_id");

    const PARENT_WITH_CONTENT = {
      _id: "parent1",
      _type: "Block",
      content: "Hello World",
      "content-en": "Hello World",
      "content-fr": "Bonjour le monde",
    };

    const NEW_BLOCK = { _id: "new_block", _parent: "parent1", _type: "Text" };

    const result = insertBlocksAtPosition([PARENT_WITH_CONTENT], [NEW_BLOCK], "parent1");

    // Expected:
    // 1. Parent's content and content-* properties should be empty
    // 2. A new Text block should be created with parent's content
    // 3. The new block should be inserted after the Text block
    expect(result.length).toBe(3);

    // Check parent block
    const updatedParent = result.find((block) => block._id === "parent1") as ChaiBlock;
    expect(updatedParent.content).toBe("");
    expect(updatedParent["content-en"]).toBe("");
    expect(updatedParent["content-fr"]).toBe("");

    // Check Text block
    const textBlock = result.find((block) => block._type === "Text") as ChaiBlock;
    expect(textBlock).toBeDefined();
    expect(textBlock._parent).toBe("parent1");
    expect(textBlock.content).toBe("Hello World");
    expect(textBlock["content-en"]).toBe("Hello World");
    expect(textBlock["content-fr"]).toBe("Bonjour le monde");

    // Check that the new block is after the Text block
    const textBlockIndex = result.findIndex((block) => block._type === "Text");
    const newBlockIndex = result.findIndex((block) => block._id === "new_block");
    expect(newBlockIndex).toBeGreaterThan(textBlockIndex);

    // Restore the original implementation
    vi.restoreAllMocks();
  });

  test("should not create Text block when parent has children", () => {
    const PARENT_WITH_CONTENT = {
      _id: "parent2",
      _type: "Text",
      content: "Hello World",
    };

    const EXISTING_CHILD = { _id: "child1", _parent: "parent2", _type: "Text" };
    const NEW_BLOCK = { _id: "new_block", _parent: "parent2", _type: "Text" };

    const result = insertBlocksAtPosition([PARENT_WITH_CONTENT, EXISTING_CHILD], [NEW_BLOCK], "parent2");

    // Should not create a Text block since parent already has children
    expect(result.length).toBe(3);
    expect(result.filter((block) => block._type === "Text").length).toBe(3);

    // Parent's content should remain unchanged
    const updatedParent = result.find((block) => block._id === "parent2") as ChaiBlock;
    expect(updatedParent.content).toBe("Hello World");
  });

  test("should not create Text block when parent has no content", () => {
    const PARENT_WITHOUT_CONTENT = { _id: "parent3", _type: "Block" };
    const NEW_BLOCK = { _id: "new_block", _parent: "parent3", _type: "Block" };

    const result = insertBlocksAtPosition([PARENT_WITHOUT_CONTENT], [NEW_BLOCK], "parent3");

    // Should not create a Text block since parent has no content
    expect(result.length).toBe(2);
    expect(result.filter((block) => block._type === "Text").length).toBe(0);
  });
});
