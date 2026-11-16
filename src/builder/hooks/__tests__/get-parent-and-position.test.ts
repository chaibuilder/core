/**
 * @vitest-environment happy-dom
 */
import { getParentAndPosition } from "~/builder/hooks/use-add-block";
import { chaiSlot } from "~/registry";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { ChaiBlock } from "~/types/common";
import { loadWebBlocks } from "~/web-blocks";

// Real built-in registrations: Box and Heading accept children, PartialBlock registers no
// canAcceptBlock (so it can never take children). "Section" is not a registered block.
loadWebBlocks();

// Root-only blocks, and a slot owner whose `headerSlot` takes only TopLevelOnly while `anySlot` takes anything.
registerTestBlocks(
  { type: "TopLevelOnly", maxDepth: 0 },
  { type: "OtherTopLevelOnly", maxDepth: 0 },
  {
    type: "SlotOwner",
    canAcceptBlock: (type: string) => type === "ChaiSlot",
    props: {
      schema: { properties: { headerSlot: chaiSlot({ accept: /^TopLevelOnly$/ }), anySlot: chaiSlot() } },
      uiSchema: {},
    },
  },
);

// A slot owner at root: its slots sit at depth 1, so anything inside one is at depth 2.
const SLOT_PAGE = [
  { _id: "owner", _type: "SlotOwner" },
  { _id: "header-slot", _type: "ChaiSlot", _parent: "owner", _slot: "headerSlot" },
  { _id: "any-slot", _type: "ChaiSlot", _parent: "owner", _slot: "anySlot" },
] as ChaiBlock[];

describe("getParentAndPosition", () => {
  it("keeps a provided parent that accepts the child", () => {
    const blocks = [{ _id: "box-1", _type: "Box" }] as ChaiBlock[];

    const result = getParentAndPosition("Heading", blocks, [], "box-1", 2);

    expect(result).toEqual({ parentBlockId: "box-1", insertPosition: 2 });
  });

  it("never nests inside a PartialBlock — walks up to its parent", () => {
    const blocks = [
      { _id: "box-1", _type: "Box" },
      { _id: "sibling", _type: "Heading", _parent: "box-1" },
      { _id: "partial-1", _type: "PartialBlock", _parent: "box-1" },
    ] as ChaiBlock[];

    const result = getParentAndPosition("Heading", blocks, [], "partial-1");

    // lands next to the partial (right after it), never inside it
    expect(result).toEqual({ parentBlockId: "box-1", insertPosition: 2 });
  });

  it("falls back to page root when a root-level PartialBlock is targeted", () => {
    const blocks = [
      { _id: "section-1", _type: "Section" },
      { _id: "partial-1", _type: "PartialBlock" },
    ] as ChaiBlock[];

    const result = getParentAndPosition("Section", blocks, [], "partial-1");

    expect(result).toEqual({ parentBlockId: undefined, insertPosition: 2 });
  });

  it("adds at page root when no parent and no selection are provided", () => {
    const result = getParentAndPosition("Section", [], [], undefined, undefined);

    expect(result).toEqual({ parentBlockId: undefined, insertPosition: undefined });
  });

  it("a slot with no accept rule takes any block past its maxDepth", () => {
    const result = getParentAndPosition("TopLevelOnly", SLOT_PAGE, [], "any-slot", -1);

    expect(result).toEqual({ parentBlockId: "any-slot", insertPosition: -1 });
  });

  it("a slot takes the type its accept rule names past its maxDepth", () => {
    const result = getParentAndPosition("TopLevelOnly", SLOT_PAGE, [], "header-slot", -1);

    expect(result).toEqual({ parentBlockId: "header-slot", insertPosition: -1 });
  });

  it("a slot still turns away a type its accept rule leaves out", () => {
    const result = getParentAndPosition("OtherTopLevelOnly", SLOT_PAGE, [], "header-slot", -1);

    expect(result).toEqual({ parentBlockId: undefined, insertPosition: 1 });
  });
});
