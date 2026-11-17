import { addPrefixToClasses, getChaiMergedPartialBlocks } from "~/render/functions";
import { parseChaiBlocksFromChaiFile } from "~/utils";
import { ChaiBlock } from "~/types/common";

// Test addPrefixToClasses function
describe("addPrefixToClasses", () => {
  it("should prefix classes without states or media queries", () => {
    const classes = "bg-red-500 text-white";
    const prefix = "test-";
    const expectedClasses = "test-bg-red-500 test-text-white";
    expect(addPrefixToClasses(classes, prefix)).toBe(expectedClasses);
  });

  it("should prefix classes with states or media queries", () => {
    const classes = "hover:bg-red-500 dark:text-white";
    const prefix = "test-";
    const expectedClasses = "hover:test-bg-red-500 dark:test-text-white";
    expect(addPrefixToClasses(classes, prefix)).toBe(expectedClasses);
  });
});

// Test convertToBlocks function
describe("convertToBlocks", () => {
  it("should return an empty array when given an empty string", () => {
    expect(parseChaiBlocksFromChaiFile("")).toEqual([]);
  });

  it("should return an error block when given invalid JSON", () => {
    const invalidJson = "some invalid json";
    const expectedErrorBlock: ChaiBlock = {
      _type: "Paragraph",
      _id: "error",
      content: "Invalid JSON. Please check the JSON string.",
    };
    expect(parseChaiBlocksFromChaiFile(invalidJson)).toEqual([expectedErrorBlock]);
  });

  it("should filter out blocks with _type starting with @chai/", () => {
    const jsonString = JSON.stringify([
      { _type: "@chai/type", _id: "1", content: "Block 1" },
      { _type: "Paragraph", _id: "2", content: "Block 2" },
    ]);
    const expectedBlocks: ChaiBlock[] = [{ _type: "Paragraph", _id: "2", content: "Block 2" }];
    expect(parseChaiBlocksFromChaiFile(jsonString)).toEqual(expectedBlocks);
  });

  it("should return all blocks if none starts with @chai", () => {
    const jsonString = JSON.stringify([
      { _type: "Paragraph", _id: "1", content: "Block 1" },
      { _type: "Header", _id: "2", content: "Block 2" },
    ]);
    const expectedBlocks: ChaiBlock[] = [
      { _type: "Paragraph", _id: "1", content: "Block 1" },
      { _type: "Header", _id: "2", content: "Block 2" },
    ];
    expect(parseChaiBlocksFromChaiFile(jsonString)).toEqual(expectedBlocks);
  });
});

// Test getMergedPartialBlocks function
describe("getMergedPartialBlocks", () => {
  const box = (id: string, extra: Partial<ChaiBlock> = {}): ChaiBlock =>
    ({ _id: id, _type: "Box", ...extra }) as ChaiBlock;
  const ref = (id: string, target: string, extra: Partial<ChaiBlock> = {}): ChaiBlock =>
    ({ _id: id, _type: "PartialBlock", partialBlockId: target, ...extra }) as ChaiBlock;

  it("inlines a single-level partial and re-parents its root blocks", () => {
    const blocks = [box("root"), ref("p1", "A", { _parent: "root" })];
    const partials = { A: [box("a1"), box("a2", { _parent: "a1" })] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.map((b) => b._id)).toEqual(["root", "a1", "a2"]);
    expect(merged[1]!._parent).toBe("root");
    expect(merged[2]!._parent).toBe("a1");
  });

  it("resolves nested partials (page -> A -> B)", () => {
    const blocks = [ref("p1", "A")];
    const partials = { A: [ref("a1", "B")], B: [box("b1")] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.map((b) => b._id)).toEqual(["b1"]);
  });

  it("does not expand beyond the maximum depth", () => {
    // MAX_PARTIAL_DEPTH = 3: page -> A -> B -> C expands; the 4th hop (D) stays
    // an unexpanded reference.
    const blocks = [ref("p1", "A")];
    const partials = {
      A: [ref("a1", "B")],
      B: [ref("b1", "C")],
      C: [ref("c1", "D")],
      D: [box("d1")],
    };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged).toHaveLength(1);
    expect(merged[0]!._type).toBe("PartialBlock");
    expect(merged[0]!.partialBlockId).toBe("D");
  });

  it("leaves self-references unexpanded instead of looping", () => {
    const blocks = [ref("p1", "A")];
    const partials = { A: [box("a1"), ref("a2", "A")] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.map((b) => b._type)).toEqual(["Box", "PartialBlock"]);
  });

  it("terminates on an A -> B -> A cycle", () => {
    const blocks = [ref("p1", "A")];
    const partials = { A: [ref("a1", "B")], B: [ref("b1", "A")] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged).toHaveLength(1);
    expect(merged[0]!._type).toBe("PartialBlock");
  });

  it("keeps unknown references and does not mutate the input array", () => {
    const source = [ref("p1", "missing")];
    const merged = getChaiMergedPartialBlocks(source, {});
    expect(merged).toHaveLength(1);
    expect(merged[0]!._type).toBe("PartialBlock");
    expect(source).toHaveLength(1);
  });

  it("skips inlining when the PartialBlock reference has _show: false", () => {
    const blocks = [box("before"), ref("p1", "A", { _show: false }), box("after")];
    const partials = { A: [box("hidden-root"), box("hidden-child", { _parent: "hidden-root" })] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.map((b) => b._id)).toEqual(["before", "after"]);
  });

  it("does not broadcast reference _show: true onto children that are authored hidden", () => {
    const blocks = [ref("p1", "A", { _show: true })];
    const partials = {
      A: [box("desktop"), box("mobile", { _show: false }), box("contact", { _parent: "desktop", _show: false })],
    };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.find((b) => b._id === "desktop")?._show).toBeUndefined();
    expect(merged.find((b) => b._id === "mobile")?._show).toBe(false);
    expect(merged.find((b) => b._id === "contact")?._show).toBe(false);
  });

  it("supports legacy GlobalBlock references", () => {
    const blocks = [{ _id: "g1", _type: "GlobalBlock", globalBlock: "A" } as ChaiBlock];
    const partials = { A: [box("a1")] };
    const merged = getChaiMergedPartialBlocks(blocks, partials);
    expect(merged.map((b) => b._id)).toEqual(["a1"]);
  });

  it("keeps a placement with a wrapper tag as the parent of the partial's roots", () => {
    const wrapper = ref("p1", "A", { _parent: "root", wrapperTag: "section", styles: "#styles:,py-6" });
    const partials = { A: [box("a1"), box("a2", { _parent: "a1" })] };
    const merged = getChaiMergedPartialBlocks([box("root"), wrapper], partials);
    expect(merged.map((b) => b._id)).toEqual(["root", "p1", "a1", "a2"]);
    expect(merged[1]).toEqual(wrapper);
    expect(merged[2]!._parent).toBe("p1");
    expect(merged[3]!._parent).toBe("a1");
  });

  it.each(["none", "script"])("replaces the placement when its wrapper tag is %s", (wrapperTag) => {
    const merged = getChaiMergedPartialBlocks([ref("p1", "A", { _parent: "root", wrapperTag })], { A: [box("a1")] });
    expect(merged.map((b) => b._id)).toEqual(["a1"]);
    expect(merged[0]!._parent).toBe("root");
  });

  it("expands a nested partial inside its wrapper", () => {
    const partials = { A: [ref("a1", "B", { wrapperTag: "div" })], B: [box("b1")] };
    const merged = getChaiMergedPartialBlocks([ref("p1", "A", { wrapperTag: "section" })], partials);
    expect(merged.map((b) => [b._id, b._parent])).toEqual([
      ["p1", undefined],
      ["a1", "p1"],
      ["b1", "a1"],
    ]);
  });

  it("hides a wrapped placement with _show: false, wrapper included", () => {
    const merged = getChaiMergedPartialBlocks([ref("p1", "A", { wrapperTag: "section", _show: false })], {
      A: [box("a1")],
    });
    expect(merged).toEqual([]);
  });
});
