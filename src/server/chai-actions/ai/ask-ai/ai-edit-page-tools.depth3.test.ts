/**
 * get_partial_blocks filtering at MAX_PARTIAL_DEPTH = 3 (the real constant) — proves the AI-side
 * enforcement derives from the constant, mirroring the builder.
 */
import { describe, expect, it } from "vitest";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { buildAiEditPageTools } from "./ai-edit-page-tools";

describe("get_partial_blocks with MAX_PARTIAL_DEPTH = 3", () => {
  // Chain: mega -> layout -> header (partialBlocks columns hold closures)
  const PARTIAL_PAGES = [
    { id: "header", name: "Header", partialBlocks: "" },
    { id: "layout", name: "Layout", partialBlocks: "header" },
    { id: "mega", name: "Mega", partialBlocks: "layout|header" },
  ];

  /** Partials are slug-less, language-less pages of the test app. */
  const seedPartials = (rows: { id: string; name: string; partialBlocks: string }[]) =>
    withTestDB(({ seedMany }) =>
      seedMany(
        "appPages",
        rows.map((row) => ({ ...row, slug: "", lang: "", pageType: "global", metadata: {} })),
      ),
    );

  const getPartialBlocks = (pageId?: string): Promise<any> =>
    withTestDB(({ inRequest }) =>
      inRequest(() => (buildAiEditPageTools({ pageHtml: "", pageId }) as any).get_partial_blocks.execute({})),
    );

  it("runs against the real depth limit", () => {
    expect(MAX_PARTIAL_DEPTH).toBe(3);
  });

  it("lists a depth-3 partial when editing a regular page", async () => {
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("page-1");
    expect(Object.keys(result.partials).sort()).toEqual(["header", "layout", "mega"]);
  });

  it("allows depth-2 partials inside a top-level partial, excludes deeper and cyclic ones", async () => {
    // footer-like fresh partial with no consumers: budget is 3 - 1 = 2
    await seedPartials([...PARTIAL_PAGES, { id: "fresh", name: "Fresh", partialBlocks: "" }]);
    const result = await getPartialBlocks("fresh");
    // layout (depth 2) fits; mega (depth 3) does not; self excluded
    expect(Object.keys(result.partials).sort()).toEqual(["header", "layout"]);
  });

  it("shrinks the budget for a partial already nested one level deep", async () => {
    // layout is used by mega -> usage depth 1, chain above = 2, budget = 1
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("layout");
    expect(Object.keys(result.partials)).toEqual(["header"]);
    // mega excluded both as too deep and as a cycle (it contains layout)
    expect(result.partials.mega).toBeUndefined();
  });

  it("returns nothing for a partial nested two levels deep", async () => {
    // header: usage depth 2 (mega -> layout -> header), chain above = 3, budget 0
    await seedPartials(PARTIAL_PAGES);
    const result = await getPartialBlocks("header");
    expect(result.partials).toEqual({});
    expect(result.note).toContain("maximum nesting depth");
  });
});
