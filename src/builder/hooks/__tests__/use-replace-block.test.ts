/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { replaceBlock, useReplaceBlock } from "~/builder/hooks/use-replace-block";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { ChaiBlock } from "~/types/common";

describe("replaceBlock", () => {
  it("should replace a block with replacement blocks", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
      { _id: "3", _parent: "1", _type: "Button" },
    ];

    const replacementBlocks: ChaiBlock[] = [
      { _id: "4", _parent: undefined, _type: "Image" },
      { _id: "5", _parent: undefined, _type: "Video" },
    ];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    expect(result).toHaveLength(4); // 3 original - 1 removed + 2 added
    expect(result.find((b) => b._id === "2")).toBeUndefined();
    expect(result.find((b) => b._id === "4")).toBeDefined();
    expect(result.find((b) => b._id === "5")).toBeDefined();
    expect(result.find((b) => b._id === "4")?._parent).toBe("1");
    expect(result.find((b) => b._id === "5")?._parent).toBe("1");
  });

  it("should preserve parent relationship for replacement blocks", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    const replacementBlocks: ChaiBlock[] = [{ _id: "3", _parent: "999", _type: "Image" }];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    // Replacement block should inherit parent from the replaced block
    expect(result.find((b) => b._id === "3")?._parent).toBe("1");
  });

  it("should remove children of the replaced block", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Section" },
      { _id: "3", _parent: "2", _type: "Text" },
      { _id: "4", _parent: "2", _type: "Button" },
    ];

    const replacementBlocks: ChaiBlock[] = [{ _id: "5", _parent: undefined, _type: "Image" }];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    expect(result).toHaveLength(2); // Only block 1 and the new block 5
    expect(result.find((b) => b._id === "2")).toBeUndefined();
    expect(result.find((b) => b._id === "3")).toBeUndefined();
    expect(result.find((b) => b._id === "4")).toBeUndefined();
    expect(result.find((b) => b._id === "5")).toBeDefined();
  });

  it("should return original blocks if block to replace is not found", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    const replacementBlocks: ChaiBlock[] = [{ _id: "3", _parent: undefined, _type: "Image" }];

    const result = replaceBlock(blocks, "999", replacementBlocks);

    expect(result).toEqual(blocks);
    expect(result).toHaveLength(2);
  });

  it("should handle replacing top-level block", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    const replacementBlocks: ChaiBlock[] = [{ _id: "3", _parent: "999", _type: "Section" }];

    const result = replaceBlock(blocks, "1", replacementBlocks);

    expect(result).toHaveLength(1); // Block 1 and its child removed, block 3 added
    expect(result.find((b) => b._id === "1")).toBeUndefined();
    expect(result.find((b) => b._id === "2")).toBeUndefined();
    expect(result.find((b) => b._id === "3")?._parent).toBeUndefined();
  });

  it("should handle empty replacement blocks array", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    const result = replaceBlock(blocks, "2", []);

    expect(result).toHaveLength(1);
    expect(result.find((b) => b._id === "2")).toBeUndefined();
  });

  it("should handle multiple replacement blocks", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    const replacementBlocks: ChaiBlock[] = [
      { _id: "3", _parent: undefined, _type: "Image" },
      { _id: "4", _parent: undefined, _type: "Video" },
      { _id: "5", _parent: undefined, _type: "Button" },
    ];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    expect(result).toHaveLength(4);
    expect(result.filter((b) => b._parent === "1")).toHaveLength(3);
  });

  it("should recursively remove deeply nested children", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Section" },
      { _id: "3", _parent: "2", _type: "Div" },
      { _id: "4", _parent: "3", _type: "Text" },
      { _id: "5", _parent: "4", _type: "Span" },
      { _id: "6", _parent: "1", _type: "Button" }, // Sibling of block 2
    ];

    const replacementBlocks: ChaiBlock[] = [{ _id: "7", _parent: undefined, _type: "Image" }];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    // Should only have block 1, block 6 (sibling), and the new block 7
    expect(result).toHaveLength(3);
    expect(result.find((b) => b._id === "1")).toBeDefined();
    expect(result.find((b) => b._id === "2")).toBeUndefined(); // Removed
    expect(result.find((b) => b._id === "3")).toBeUndefined(); // Removed (child)
    expect(result.find((b) => b._id === "4")).toBeUndefined(); // Removed (grandchild)
    expect(result.find((b) => b._id === "5")).toBeUndefined(); // Removed (great-grandchild)
    expect(result.find((b) => b._id === "6")).toBeDefined(); // Preserved (sibling)
    expect(result.find((b) => b._id === "7")).toBeDefined(); // Added
    expect(result.find((b) => b._id === "7")?._parent).toBe("1");
  });

  it("should preserve internal tree structure of replacement blocks", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
    ];

    // Replacement blocks with their own nested structure
    const replacementBlocks: ChaiBlock[] = [
      { _id: "3", _parent: undefined, _type: "Section" }, // Root level
      { _id: "4", _parent: "3", _type: "Div" }, // Child of 3
      { _id: "5", _parent: "4", _type: "Text" }, // Grandchild of 3
      { _id: "6", _parent: undefined, _type: "Button" }, // Another root level
    ];

    const result = replaceBlock(blocks, "2", replacementBlocks);

    expect(result).toHaveLength(5); // Block 1 + 4 replacement blocks

    // Root-level replacement blocks should have parent "1"
    expect(result.find((b) => b._id === "3")?._parent).toBe("1");
    expect(result.find((b) => b._id === "6")?._parent).toBe("1");

    // Nested structure should be preserved
    expect(result.find((b) => b._id === "4")?._parent).toBe("3");
    expect(result.find((b) => b._id === "5")?._parent).toBe("4");
  });

  it("should insert replacement blocks at the exact position of removed block", () => {
    const blocks: ChaiBlock[] = [
      { _id: "1", _parent: undefined, _type: "Container" },
      { _id: "2", _parent: "1", _type: "Text" },
      { _id: "3", _parent: "1", _type: "Button" },
      { _id: "4", _parent: "1", _type: "Image" },
    ];

    const replacementBlocks: ChaiBlock[] = [
      { _id: "5", _parent: undefined, _type: "Section" },
      { _id: "6", _parent: undefined, _type: "Div" },
    ];

    const result = replaceBlock(blocks, "3", replacementBlocks);

    // Result should be: 1, 2, 5, 6, 4 (replacement blocks inserted where 3 was)
    expect(result).toHaveLength(5);
    expect(result[0]._id).toBe("1");
    expect(result[1]._id).toBe("2");
    expect(result[2]._id).toBe("5"); // First replacement block
    expect(result[3]._id).toBe("6"); // Second replacement block
    expect(result[4]._id).toBe("4"); // Block that was after the removed block
  });
});

describe("useReplaceBlock", () => {
  const PAGE_BLOCKS: ChaiBlock[] = [
    { _id: "1", _parent: undefined, _type: "Container" },
    { _id: "2", _parent: "1", _type: "Text" },
    { _id: "3", _parent: "1", _type: "Button" },
  ];

  const render = (permissions: string[] | null, selectedBlockIds: string[] = []) =>
    renderHookInBuilder(() => useReplaceBlock(), {
      blocks: PAGE_BLOCKS,
      selectedBlockIds,
      builderProps: { permissions },
    });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should replace block when permission is granted", () => {
    const { result, store } = render(["pages:update"]);

    const replacementBlocks: ChaiBlock[] = [{ _id: "4", _parent: undefined, _type: "Image" }];

    act(() => {
      result.current("2", replacementBlocks);
    });

    const newBlocks = store.get(presentBlocksAtom) as ChaiBlock[];
    expect(newBlocks.find((b: ChaiBlock) => b._id === "2")).toBeUndefined();
    expect(newBlocks.find((b: ChaiBlock) => b._id === "4")).toBeDefined();
  });

  it("should not replace block when permission is denied", () => {
    vi.useFakeTimers();
    // has other permissions, but not "pages:update"
    const { result, store } = render(["pages:read"], ["3"]);

    const replacementBlocks: ChaiBlock[] = [{ _id: "4", _parent: undefined, _type: "Image" }];

    act(() => {
      result.current("2", replacementBlocks);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(store.get(presentBlocksAtom)).toEqual(PAGE_BLOCKS);
    expect(store.get(selectedBlockIdsAtom)).toEqual(["3"]);
  });

  it("should select first replacement block after replace", () => {
    vi.useFakeTimers();
    const { result, store } = render(null);

    const replacementBlocks: ChaiBlock[] = [
      { _id: "4", _parent: undefined, _type: "Image" },
      { _id: "5", _parent: undefined, _type: "Video" },
    ];

    act(() => {
      result.current("2", replacementBlocks);
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(store.get(selectedBlockIdsAtom)).toEqual(["4"]);
  });

  it("should not select any block if replacement blocks array is empty", () => {
    vi.useFakeTimers();
    const { result, store } = render(null, ["3"]);

    act(() => {
      result.current("2", []);
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(store.get(presentBlocksAtom).map((b: ChaiBlock) => b._id)).toEqual(["1", "3"]);
    expect(store.get(selectedBlockIdsAtom)).toEqual(["3"]);
  });

  it("should handle replacing with multiple replacement blocks", () => {
    const { result, store } = render(null);

    const replacementBlocks: ChaiBlock[] = [
      { _id: "4", _parent: undefined, _type: "Image" },
      { _id: "5", _parent: undefined, _type: "Video" },
      { _id: "6", _parent: undefined, _type: "Text" },
    ];

    act(() => {
      result.current("2", replacementBlocks);
    });

    const newBlocks = store.get(presentBlocksAtom);
    expect(newBlocks).toHaveLength(5); // 3 original - 1 removed + 3 added
  });
});
