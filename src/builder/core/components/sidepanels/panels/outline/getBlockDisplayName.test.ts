import {
  getBlockDisplayName,
  getBlockHoverTitle,
  getBlockTypeLabel,
  getOutlineNodeLabel,
  getPartialDisplayName,
} from "./node";

describe("getBlockDisplayName", () => {
  it("should return the _name when it exists", () => {
    const data = { _name: "My Block", _type: "Box", tag: "section" };
    expect(getBlockDisplayName(data)).toBe("My Block");
  });

  it("should return the formatted tag name for Box type when tag is not div", () => {
    const data = { _type: "Box", tag: "section" };
    expect(getBlockDisplayName(data)).toBe("Section");
  });

  it("should not return tag name for Box type when tag is div", () => {
    const data = { _type: "Box", tag: "div" };
    expect(getBlockDisplayName(data)).toBe("Box");
  });

  it("should return the type name when no _name or special handling is needed", () => {
    const data = { _type: "Custom/Button" };
    expect(getBlockDisplayName(data)).toBe("Button");
  });

  it("should handle Box type with no tag", () => {
    const data = { _type: "Box" };
    expect(getBlockDisplayName(data)).toBe("Box");
  });

  it("should handle empty data object", () => {
    expect(getBlockDisplayName({})).toBe("");
  });

  it("should handle null or undefined input", () => {
    expect(getBlockDisplayName(null as any)).toBe("");
    expect(getBlockDisplayName(undefined as any)).toBe("");
  });
});

describe("getPartialDisplayName", () => {
  const pages = [
    { id: "p1", name: "Text Me" },
    { id: "p2", name: "hero banner" },
  ];

  it("resolves the referenced partial's current name (start-cased) from the pages list", () => {
    expect(getPartialDisplayName(true, "p1", pages)).toBe("Text Me");
    expect(getPartialDisplayName(true, "p2", pages)).toBe("Hero Banner");
  });

  it("returns undefined for a non-partial block so the caller falls back to the label", () => {
    expect(getPartialDisplayName(false, "p1", pages)).toBeUndefined();
  });

  it("returns undefined when there is no partial ref", () => {
    expect(getPartialDisplayName(true, "", pages)).toBeUndefined();
  });

  it("returns undefined when the referenced page is missing or unnamed (fall back to _name/label)", () => {
    expect(getPartialDisplayName(true, "missing", pages)).toBeUndefined();
    expect(getPartialDisplayName(true, "p3", [{ id: "p3", name: "" }])).toBeUndefined();
    expect(getPartialDisplayName(true, "p1", undefined)).toBeUndefined();
  });
});

describe("getOutlineNodeLabel", () => {
  const pages = [{ id: "p1", name: "Site Header" }];

  it("labels a used partial from the partial itself, ignoring a stale baked _name", () => {
    const data = { _type: "PartialBlock", _name: "Old Header", partialBlockId: "p1" };
    expect(getOutlineNodeLabel(data, true, "p1", pages)).toBe("Site Header");
  });

  it("labels a used partial from the partial itself when _name is empty", () => {
    const data = { _type: "GlobalBlock", _name: "", globalBlock: "p1" };
    expect(getOutlineNodeLabel(data, true, "p1", pages)).toBe("Site Header");
  });

  it("falls back to _name / label when the referenced partial page can't be resolved", () => {
    expect(getOutlineNodeLabel({ _type: "PartialBlock", _name: "Old Header" }, true, "gone", pages)).toBe("Old Header");
    expect(getOutlineNodeLabel({ _type: "PartialBlock" }, true, "gone", pages)).toBe("PartialBlock");
  });

  it("keeps the normal name resolution for non-partial blocks", () => {
    expect(getOutlineNodeLabel({ _type: "Box", _name: "My Block" }, false, "", pages)).toBe("My Block");
    expect(getOutlineNodeLabel({ _type: "Box", tag: "section" }, false, "", pages)).toBe("Section");
  });
});

describe("getBlockTypeLabel", () => {
  it("should return the formatted tag name for Box type when tag is not div", () => {
    expect(getBlockTypeLabel({ _type: "Box", tag: "section" })).toBe("Section");
  });

  it("should return the base type name for custom blocks", () => {
    expect(getBlockTypeLabel({ _type: "Custom/NewVehiclesList" })).toBe("NewVehiclesList");
  });
});

describe("getBlockHoverTitle", () => {
  it("should include the original block type when a block is renamed", () => {
    expect(getBlockHoverTitle({ _name: "Hero Heading", _type: "Heading" })).toBe("Hero Heading (Heading)");
  });

  it("should keep the existing title when the display name already matches the type", () => {
    expect(getBlockHoverTitle({ _name: "Heading", _type: "Heading" })).toBe("Heading");
  });

  it("should use the derived Box tag label in the hover title", () => {
    expect(getBlockHoverTitle({ _name: "Hero Section", _type: "Box", tag: "section" })).toBe("Hero Section (Section)");
  });
});
