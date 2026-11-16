import { getParentAndPosition } from "~/builder/hooks/use-add-block";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { ChaiBlock } from "~/types/common";

// Real registry entries. `canAcceptChildBlock` reads `canAcceptBlock` from the parent's registration
// (unregistered or absent => false); `canBeNestedInside` reads `canBeNested` from the child's
// registration (unregistered or absent => true).
registerTestBlocks(
  // accepts every child
  { type: "Box", canAcceptBlock: () => true },
  { type: "Section", canAcceptBlock: () => true },
  // registered, but accepts no children
  { type: "Leaf" },
  { type: "LeafSection" },
  { type: "LeafBox" },
  // a child that may only be nested directly inside a Box
  { type: "BoxOnlyText", canBeNested: (parentType: string) => parentType === "Box" },
  // depth-limited blocks
  { type: "TopLevelOnly", maxDepth: 0 },
  { type: "OneLevelDeep", maxDepth: 1 },
  { type: "Unlimited", maxDepth: -1 },
);

// Form-like page: two root sections, the first holding a form with a field.
const FORM_PAGE: ChaiBlock[] = [
  { _id: "section-1", _type: "Section" },
  { _id: "form", _type: "Box", _parent: "section-1" },
  { _id: "field", _type: "Box", _parent: "form" },
  { _id: "section-2", _type: "Section" },
];

describe("getParentAndPosition", () => {
  describe("when no parent and no selection", () => {
    it("returns undefined parentBlockId and undefined insertPosition", () => {
      const allBlocks: ChaiBlock[] = [{ _id: "block-1", _type: "Box" }];
      const result = getParentAndPosition("Text", allBlocks, []);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBeUndefined();
    });
  });

  describe("when providedParentId is given", () => {
    it("uses providedParentId as the starting candidate", () => {
      const allBlocks: ChaiBlock[] = [{ _id: "container", _type: "Box" }];
      const result = getParentAndPosition("Text", allBlocks, [], "container");

      expect(result.parentBlockId).toBe("container");
      expect(result.insertPosition).toBeUndefined();
    });

    it("uses providedParentId over selectedBlockIds when both are present", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "selected-block", _type: "Box" },
        { _id: "provided-parent", _type: "Box" },
      ];
      const result = getParentAndPosition("Text", allBlocks, ["selected-block"], "provided-parent");

      expect(result.parentBlockId).toBe("provided-parent");
    });

    it("respects provided position when given", () => {
      const allBlocks: ChaiBlock[] = [{ _id: "container", _type: "Box" }];
      const result = getParentAndPosition("Text", allBlocks, [], "container", 3);

      expect(result.parentBlockId).toBe("container");
      expect(result.insertPosition).toBe(3);
    });
  });

  describe("when selectedBlockIds is used as starting point", () => {
    it("uses the first selected block as the candidate parent", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "sel-1", _type: "Box" },
        { _id: "sel-2", _type: "Box" },
      ];
      const result = getParentAndPosition("Text", allBlocks, ["sel-1", "sel-2"]);

      expect(result.parentBlockId).toBe("sel-1");
    });
  });

  describe("when candidate cannot accept child (walks up the tree)", () => {
    it("walks up to the parent when the selected block cannot accept the child", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "box", _type: "Box" },
        { _id: "text", _type: "Leaf", _parent: "box" },
      ];
      // "text" (Leaf) cannot accept children; "box" can
      const result = getParentAndPosition("Text", allBlocks, ["text"]);

      expect(result.parentBlockId).toBe("box");
    });

    it("inserts after the previously-traversed sibling when walking up", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "box", _type: "Box" },
        { _id: "sibling-1", _type: "Leaf", _parent: "box" },
        { _id: "sibling-2", _type: "Leaf", _parent: "box" },
        { _id: "sibling-3", _type: "Leaf", _parent: "box" },
      ];
      // Start from sibling-2 (index 1 in siblings). After walking up, the new block
      // should be inserted after sibling-2, i.e. at index 2.
      const result = getParentAndPosition("Text", allBlocks, ["sibling-2"]);

      expect(result.parentBlockId).toBe("box");
      expect(result.insertPosition).toBe(2);
    });

    it("walks all the way to root when no ancestor can accept the child", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "section", _type: "LeafSection" },
        { _id: "box", _type: "LeafBox", _parent: "section" },
        { _id: "text", _type: "Leaf", _parent: "box" },
      ];
      const result = getParentAndPosition("Text", allBlocks, ["text"]);

      expect(result.parentBlockId).toBeUndefined();
    });

    it("computes root-level insertPosition after walking to root", () => {
      // Three root-level blocks; user selects section-2
      const allBlocks: ChaiBlock[] = [
        { _id: "section-1", _type: "LeafSection" },
        { _id: "section-2", _type: "LeafSection" },
        { _id: "section-3", _type: "LeafSection" },
      ];
      const result = getParentAndPosition("Text", allBlocks, ["section-2"]);

      expect(result.parentBlockId).toBeUndefined();
      // section-2 is at root index 1, so new block should be inserted at index 2
      expect(result.insertPosition).toBe(2);
    });
  });

  describe("canBeNestedInside constraint", () => {
    it("skips a parent when canBeNestedInside returns false even if canAcceptChildBlock is true", () => {
      // every ancestor accepts children, but BoxOnlyText may only be nested inside a Box
      const allBlocks: ChaiBlock[] = [
        { _id: "box", _type: "Box" },
        { _id: "section", _type: "Section", _parent: "box" },
        { _id: "text", _type: "Section", _parent: "section" },
      ];
      const result = getParentAndPosition("BoxOnlyText", allBlocks, ["text"]);

      expect(result.parentBlockId).toBe("box");
    });
  });

  describe("maxDepth constraint", () => {
    it("maxDepth 0 climbs out of a deep selection to root, right after its top-level ancestor", () => {
      const result = getParentAndPosition("TopLevelOnly", FORM_PAGE, ["field"]);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(1);
    });

    it("maxDepth 0 with a root section selected goes after that section", () => {
      const result = getParentAndPosition("TopLevelOnly", FORM_PAGE, ["section-2"]);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(2);
    });

    it("maxDepth 0 with nothing selected appends to root", () => {
      const result = getParentAndPosition("TopLevelOnly", FORM_PAGE, [], undefined, -1);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(-1);
    });

    it("maxDepth 0 replaces the panel's -1 position once it climbs", () => {
      const result = getParentAndPosition("TopLevelOnly", FORM_PAGE, ["field"], undefined, -1);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(1);
    });

    it("maxDepth 0 replaces a position meant for the too-deep provided parent", () => {
      const result = getParentAndPosition("TopLevelOnly", FORM_PAGE, [], "form", 0);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(1);
    });

    it("maxDepth 1 nests inside a selected root section", () => {
      const result = getParentAndPosition("OneLevelDeep", FORM_PAGE, ["section-1"], undefined, -1);

      expect(result.parentBlockId).toBe("section-1");
      expect(result.insertPosition).toBe(-1);
    });

    it("maxDepth 1 climbs from a depth-2 selection to the root section, after the form", () => {
      const result = getParentAndPosition("OneLevelDeep", FORM_PAGE, ["field"], undefined, -1);

      expect(result.parentBlockId).toBe("section-1");
      expect(result.insertPosition).toBe(1);
    });

    it("maxDepth -1 nests into the selection exactly like an unlimited block", () => {
      const unlimited = getParentAndPosition("Unlimited", FORM_PAGE, ["field"], undefined, -1);
      const unset = getParentAndPosition("Text", FORM_PAGE, ["field"], undefined, -1);

      expect(unlimited).toEqual({ parentBlockId: "field", insertPosition: -1 });
      expect(unset).toEqual(unlimited);
    });

    it("an explicit maxDepth argument overrides the registered one", () => {
      // Box is registered without a limit; library blocks pass their limit this way.
      const result = getParentAndPosition("Box", FORM_PAGE, ["field"], undefined, -1, 0);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBe(1);
    });
  });

  describe("providedPosition overrides auto-computed position", () => {
    it("does not overwrite insertPosition when providedPosition is given", () => {
      const allBlocks: ChaiBlock[] = [
        { _id: "box", _type: "Box" },
        { _id: "sibling-1", _type: "Leaf", _parent: "box" },
        { _id: "sibling-2", _type: "Leaf", _parent: "box" },
      ];
      // Even though sibling-2 is at index 1, providedPosition=0 should be respected
      const result = getParentAndPosition("Text", allBlocks, ["sibling-2"], undefined, 0);

      expect(result.parentBlockId).toBe("box");
      expect(result.insertPosition).toBe(0);
    });
  });

  describe("when candidateParent block is not found in allBlocks", () => {
    it("stops walking and returns undefined parent when block id is not in allBlocks", () => {
      const allBlocks: ChaiBlock[] = [];
      const result = getParentAndPosition("Text", allBlocks, ["non-existent-id"]);

      expect(result.parentBlockId).toBeUndefined();
      expect(result.insertPosition).toBeUndefined();
    });
  });

  describe("deep tree traversal", () => {
    it("traverses multiple levels to find a valid ancestor", () => {
      // Box -> Section -> Div -> Text (selected); only Box can accept children
      const allBlocks: ChaiBlock[] = [
        { _id: "box", _type: "Box" },
        { _id: "section", _type: "LeafSection", _parent: "box" },
        { _id: "div", _type: "LeafBox", _parent: "section" },
        { _id: "text", _type: "Leaf", _parent: "div" },
      ];
      const result = getParentAndPosition("NewText", allBlocks, ["text"]);

      expect(result.parentBlockId).toBe("box");
      // "section" is the direct child of "box" that was last traversed, and it is at index 0
      expect(result.insertPosition).toBe(1);
    });
  });
});
