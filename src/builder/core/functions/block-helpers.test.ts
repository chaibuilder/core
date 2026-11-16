import {
  canDeleteBlock,
  canDeleteBlocks,
  canDuplicateBlock,
  canDuplicateBlocks,
  canMoveBlock,
  canMoveBlocks,
  getBlockActionAttrs,
  getBlockDepth,
  getBlockMaxDepth,
} from "~/builder/core/functions/block-helpers";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { loadWebBlocks } from "~/web-blocks";

loadWebBlocks();

registerTestBlocks(
  { type: "DepthLimitedHelperBlock", maxDepth: 0 },
  { type: "ConfigLockedBlock", canDelete: () => false, canMove: () => false, canDuplicate: () => false },
  { type: "ConfigOpenBlock", canDelete: () => true, canMove: () => true, canDuplicate: () => true },
  "PlainBlock",
);

const ACTIONS = [
  ["delete", canDeleteBlock, "_canDelete"],
  ["move", canMoveBlock, "_canMove"],
  ["duplicate", canDuplicateBlock, "_canDuplicate"],
] as const;

describe.each(ACTIONS)("can %s a block instance", (_action, canPerform, flag) => {
  it("an explicit true overrides a config that denies", () => {
    expect(canPerform({ _type: "ConfigLockedBlock", [flag]: true })).toBe(true);
  });

  it("an explicit false overrides a config that allows", () => {
    expect(canPerform({ _type: "ConfigOpenBlock", [flag]: false })).toBe(false);
  });

  it("an explicit false applies to a block with no config callback", () => {
    expect(canPerform({ _type: "PlainBlock", [flag]: false })).toBe(false);
  });

  it("falls back to the config callback when the flag is omitted", () => {
    expect(canPerform({ _type: "ConfigLockedBlock" })).toBe(false);
    expect(canPerform({ _type: "ConfigOpenBlock" })).toBe(true);
  });

  it("defaults to true with no flag and no callback", () => {
    expect(canPerform({ _type: "PlainBlock" })).toBe(true);
    expect(canPerform({ _type: "__Unregistered__" })).toBe(true);
  });
});

describe("config-only restrictions", () => {
  it("keep repeater items fixed while list items stay free", () => {
    const repeaterItem = { _type: "RepeaterItem" };
    expect([canDeleteBlock(repeaterItem), canMoveBlock(repeaterItem), canDuplicateBlock(repeaterItem)]).toEqual([
      false,
      false,
      false,
    ]);
    expect(canDeleteBlock({ _type: "RepeaterEmptyState" })).toBe(false);
    expect(canMoveBlock({ _type: "ListItem" })).toBe(true);
  });
});

describe("bulk action checks", () => {
  const blocks = [
    { _id: "open", _type: "PlainBlock" },
    { _id: "locked", _type: "PlainBlock", _canDelete: false, _canMove: false, _canDuplicate: false },
  ];

  it("allow a selection where every block allows the action", () => {
    expect(canDeleteBlocks(["open"], blocks)).toBe(true);
    expect(canMoveBlocks(["open"], blocks)).toBe(true);
    expect(canDuplicateBlocks(["open"], blocks)).toBe(true);
  });

  it("reject a mixed selection outright", () => {
    expect(canDeleteBlocks(["open", "locked"], blocks)).toBe(false);
    expect(canMoveBlocks(["open", "locked"], blocks)).toBe(false);
    expect(canDuplicateBlocks(["locked", "open"], blocks)).toBe(false);
  });
});

describe("getBlockActionAttrs", () => {
  it("emits a hint only for disallowed actions", () => {
    expect(getBlockActionAttrs({ _type: "PlainBlock" })).toEqual([]);
    expect(getBlockActionAttrs({ _type: "PlainBlock", _canMove: false })).toEqual([
      { key: "can-move", value: "false" },
    ]);
    expect(getBlockActionAttrs({ _type: "ConfigLockedBlock" })).toEqual([
      { key: "can-move", value: "false" },
      { key: "can-delete", value: "false" },
      { key: "can-duplicate", value: "false" },
    ]);
  });
});

describe("getBlockDepth", () => {
  const blocks = [
    { _id: "root" },
    { _id: "child", _parent: "root" },
    { _id: "grandchild", _parent: "child" },
  ];

  it("is 0 for a root block", () => {
    expect(getBlockDepth("root", blocks)).toBe(0);
  });

  it("counts parent hops", () => {
    expect(getBlockDepth("child", blocks)).toBe(1);
    expect(getBlockDepth("grandchild", blocks)).toBe(2);
  });

  it("is 0 for an unknown block", () => {
    expect(getBlockDepth("missing", blocks)).toBe(0);
  });
});

describe("getBlockMaxDepth", () => {
  it("returns the registered maxDepth", () => {
    expect(getBlockMaxDepth("DepthLimitedHelperBlock")).toBe(0);
  });

  it("is -1 for an unregistered type", () => {
    expect(getBlockMaxDepth("__UnregisteredMaxDepthType__")).toBe(-1);
  });
});
