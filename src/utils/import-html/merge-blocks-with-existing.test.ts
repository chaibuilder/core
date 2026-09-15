import { describe, expect, test } from "vitest";
import { ChaiBlock } from "~/types";
import { mergeBlocksWithExisting } from "./html-to-json";

describe("mergeBlocksWithExisting", () => {
  test("keeps the existing block identity when _bid matches (#3240)", () => {
    const existing: ChaiBlock[] = [{ _id: "keep-me", _type: "Heading", content: "Old" }];
    // Import seeds a fresh _id and carries the matched block's id in _bid.
    const imported: ChaiBlock[] = [{ _id: "fresh-uuid", _bid: "keep-me", _type: "Heading", content: "New" } as ChaiBlock];

    const [merged] = mergeBlocksWithExisting(imported, existing);
    expect(merged._id).toBe("keep-me");
    expect(merged.content).toBe("New");
    expect(merged._bid).toBeUndefined();
  });

  test("restores the original value for a structured prop the edit left unchanged", () => {
    const items = [{ id: "1" }, { id: "2" }];
    const existing: ChaiBlock[] = [{ _id: "a", _type: "Gallery", items, title: "Old" }];
    // Same items by value but a different array instance (a lossless re-encode),
    // and a genuinely changed scalar prop.
    const imported: ChaiBlock[] = [
      { _id: "x", _bid: "a", _type: "Gallery", items: [{ id: "1" }, { id: "2" }], title: "New" } as ChaiBlock,
    ];

    const [merged] = mergeBlocksWithExisting(imported, existing);
    expect(merged.items).toBe(items); // exact original reference, not the re-encoded copy
    expect(merged.title).toBe("New"); // the real edit is kept
  });

  test("passes through an imported block with no existing match, dropping _bid", () => {
    const [merged] = mergeBlocksWithExisting([{ _id: "n", _bid: "missing", _type: "Box" } as ChaiBlock], [
      { _id: "other", _type: "Box" },
    ]);
    expect(merged._id).toBe("n");
    expect(merged._bid).toBeUndefined();
  });

  test("repoints a child _parent when the matched parent's identity is restored (#3240)", () => {
    const existing: ChaiBlock[] = [{ _id: "parent-real", _type: "Box" }];
    // Parent matched by _bid (fresh import _id); a new child points its _parent
    // at that fresh id.
    const imported: ChaiBlock[] = [
      { _id: "parent-tmp", _bid: "parent-real", _type: "Box" } as ChaiBlock,
      { _id: "child", _parent: "parent-tmp", _type: "Heading", content: "Hi" } as ChaiBlock,
    ];
    const [parent, child] = mergeBlocksWithExisting(imported, existing);
    expect(parent._id).toBe("parent-real");
    expect(child._parent).toBe("parent-real");
  });

  test("keeps the existing _parent when the imported (root) block has none", () => {
    const existing: ChaiBlock[] = [{ _id: "target", _parent: "box", _type: "Heading", content: "Old" }];
    // applyEditBlock passes the edit target as a root (no _parent).
    const imported: ChaiBlock[] = [{ _id: "tmp", _bid: "target", _type: "Heading", content: "New" } as ChaiBlock];
    const [merged] = mergeBlocksWithExisting(imported, existing);
    expect(merged._id).toBe("target");
    expect(merged._parent).toBe("box");
    expect(merged.content).toBe("New");
  });
});
