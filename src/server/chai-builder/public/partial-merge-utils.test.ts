import { describe, expect, it } from "vitest";
import { withTableUnavailable } from "~/tests/setup/db-faults";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { ChaiBlock } from "~/types";
import {
  collectPartialBlocksMap,
  computePartialIdsClosure,
  extractPartialBlockIds,
  replacePartialBlocks,
} from "./partial-merge-utils";

const block = (props: Partial<ChaiBlock> & { _id: string }): ChaiBlock => ({ _type: "Box", ...props }) as ChaiBlock;
const partialRef = (id: string, target: string, extra: Partial<ChaiBlock> = {}): ChaiBlock =>
  ({ _id: id, _type: "PartialBlock", partialBlockId: target, ...extra }) as ChaiBlock;

describe("extractPartialBlockIds", () => {
  it("collects PartialBlock and legacy GlobalBlock ids, skipping empty refs", () => {
    const blocks = [
      partialRef("1", "A"),
      { _id: "2", _type: "GlobalBlock", globalBlock: "B" } as ChaiBlock,
      { _id: "3", _type: "PartialBlock" } as ChaiBlock,
      block({ _id: "4" }),
    ];
    expect(extractPartialBlockIds(blocks)).toEqual(["A", "B"]);
  });
});

describe("replacePartialBlocks", () => {
  it("expands two levels of nested partials", () => {
    const map = new Map<string, ChaiBlock[]>([
      ["A", [block({ _id: "a1" }), partialRef("a2", "B")]],
      ["B", [block({ _id: "b1", _name: "inner" })]],
    ]);
    const result = replacePartialBlocks([partialRef("p1", "A")], map);
    expect(result.map((b) => b._name ?? b._type)).toEqual(["Box", "inner"]);
    expect(result.some((b) => b._type === "PartialBlock")).toBe(false);
  });

  it("leaves a self-referencing partial unexpanded instead of looping", () => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" }), partialRef("a2", "A")]]]);
    const result = replacePartialBlocks([partialRef("p1", "A")], map);
    // A expands once; the inner self-reference stays as a PartialBlock ref
    expect(result).toHaveLength(2);
    expect(result.filter((b) => b._type === "PartialBlock")).toHaveLength(1);
  });

  it("terminates on an A -> B -> A cycle", () => {
    const map = new Map<string, ChaiBlock[]>([
      ["A", [partialRef("a1", "B")]],
      ["B", [partialRef("b1", "A")]],
    ]);
    const result = replacePartialBlocks([partialRef("p1", "A")], map);
    // A -> B expand, the B -> A backref survives as an unexpanded reference
    expect(result).toHaveLength(1);
    expect(result[0]!._type).toBe("PartialBlock");
  });

  it("clamps expansion at MAX_PARTIAL_DEPTH (3 levels)", () => {
    const map = new Map<string, ChaiBlock[]>([
      ["A", [partialRef("a1", "B")]],
      ["B", [partialRef("b1", "C")]],
      ["C", [partialRef("c1", "D")]],
      ["D", [block({ _id: "d1", _name: "too-deep" })]],
    ]);
    const result = replacePartialBlocks([partialRef("p1", "A")], map);
    // page -> A -> B -> C expand; D (level 4) stays an unexpanded reference
    expect(result).toHaveLength(1);
    expect(result[0]!._type).toBe("PartialBlock");
    expect(result[0]!.partialBlockId).toBe("D");
  });

  it("skips inlining when the PartialBlock reference has _show: false", () => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" }), block({ _id: "a2", _parent: "a1" })]]]);
    const result = replacePartialBlocks(
      [
        block({ _id: "before" }),
        partialRef("p1", "A", { _parent: "container", _show: false }),
        block({ _id: "after" }),
      ],
      map,
    );
    expect(result.map((b) => b._id)).toEqual(["before", "after"]);
  });

  it("re-parents top-level partial blocks when the reference is shown", () => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" })]]]);
    const result = replacePartialBlocks([partialRef("p1", "A", { _parent: "container" })], map);
    expect(result[0]!._parent).toBe("container");
  });

  it("does not overwrite child _show: false when the reference has _show: true", () => {
    const map = new Map<string, ChaiBlock[]>([
      [
        "A",
        [
          block({ _id: "desktop", _name: "Desktop menu" }),
          block({ _id: "mobile", _name: "Mobile menu", _show: false }),
          block({ _id: "contact", _name: "Contact", _parent: "desktop", _show: false }),
        ],
      ],
    ]);
    const result = replacePartialBlocks([partialRef("p1", "A", { _show: true })], map);
    const byName = Object.fromEntries(result.map((b) => [b._name, b]));
    expect(byName["Desktop menu"]?._show).toBeUndefined();
    expect(byName["Mobile menu"]?._show).toBe(false);
    expect(byName["Contact"]?._show).toBe(false);
  });

  it("assigns fresh ids per instance so a partial can appear twice", () => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" })]]]);
    const result = replacePartialBlocks([partialRef("p1", "A"), partialRef("p2", "A")], map);
    expect(result).toHaveLength(2);
    expect(result[0]!._id).not.toBe(result[1]!._id);
    expect(result[0]!._id).not.toBe("a1");
  });

  it("leaves unknown partial ids unexpanded", () => {
    const result = replacePartialBlocks([partialRef("p1", "missing")], new Map());
    expect(result).toEqual([partialRef("p1", "missing")]);
  });

  it("keeps a placement with a wrapper tag as the parent of the partial's roots", () => {
    const map = new Map<string, ChaiBlock[]>([
      ["A", [block({ _id: "a1", _name: "root" }), block({ _id: "a2", _name: "child", _parent: "a1" })]],
    ]);
    const wrapper = partialRef("p1", "A", { _parent: "container", wrapperTag: "section", styles: "#styles:,py-6" });
    const result = replacePartialBlocks([wrapper], map);
    const byName = Object.fromEntries(result.map((b) => [b._name, b]));
    expect(result[0]).toEqual(wrapper);
    expect(byName["root"]?._parent).toBe("p1");
    expect(byName["child"]?._parent).toBe(byName["root"]?._id);
  });

  it.each(["none", "script"])("replaces the placement when its wrapper tag is %s", (wrapperTag) => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" })]]]);
    const result = replacePartialBlocks([partialRef("p1", "A", { _parent: "container", wrapperTag })], map);
    expect(result.map((b) => b._type)).toEqual(["Box"]);
    expect(result[0]!._parent).toBe("container");
  });

  it("expands a nested partial inside its wrapper", () => {
    const map = new Map<string, ChaiBlock[]>([
      ["A", [partialRef("a1", "B", { wrapperTag: "div" })]],
      ["B", [block({ _id: "b1", _name: "inner" })]],
    ]);
    const result = replacePartialBlocks([partialRef("p1", "A", { wrapperTag: "section" })], map);
    expect(result.map((b) => b.wrapperTag ?? b._name)).toEqual(["section", "div", "inner"]);
    expect(result[1]!._parent).toBe("p1");
    expect(result[2]!._parent).toBe(result[1]!._id);
  });

  it("hides a wrapped placement with _show: false, wrapper included", () => {
    const map = new Map<string, ChaiBlock[]>([["A", [block({ _id: "a1" })]]]);
    const result = replacePartialBlocks([partialRef("p1", "A", { wrapperTag: "section", _show: false })], map);
    expect(result).toEqual([]);
  });
});

/** Draft partial pages stored in the real `app_pages` table. */
const seedPartials = (rows: { id: string; blocks: ChaiBlock[] }[]) =>
  withTestDB(async ({ seedMany }) => {
    await seedMany(
      "appPages",
      rows.map((row) => ({ ...row, name: row.id, slug: `/${row.id}`, pageType: "global" })),
    );
  });

describe("collectPartialBlocksMap", () => {
  it("makes no queries when the seeded map already covers all references", async () => {
    const seed = new Map<string, ChaiBlock[]>([
      ["A", [partialRef("a1", "B")]],
      ["B", [block({ _id: "b1" })]],
    ]);
    // Any query against app_pages would fail and surface as FAILED_TO_FETCH_PARTIAL_BLOCKS.
    const map = await withTableUnavailable(schema.appPages, () =>
      collectPartialBlocksMap([partialRef("p1", "A")], seed, true, TEST_APP_ID),
    );
    expect([...map.keys()].sort()).toEqual(["A", "B"]);
  });

  it("fetches nested partials missing from a stale seed", async () => {
    await seedPartials([
      { id: "A", blocks: [block({ _id: "a-db" })] },
      { id: "B", blocks: [block({ _id: "b1" })] },
    ]);
    // Seed knows A (stale column: B missing) — B must be fetched, A must not be refetched.
    const seed = new Map<string, ChaiBlock[]>([["A", [partialRef("a1", "B")]]]);
    const map = await collectPartialBlocksMap([partialRef("p1", "A")], seed, true, TEST_APP_ID);
    expect([...map.keys()].sort()).toEqual(["A", "B"]);
    expect(map.get("A")).toEqual([partialRef("a1", "B")]);
    expect(map.get("B")).toEqual([block({ _id: "b1" })]);
  });

  it("fetches level by level when nothing is seeded", async () => {
    await seedPartials([
      { id: "A", blocks: [partialRef("a1", "B")] },
      { id: "B", blocks: [block({ _id: "b1" })] },
    ]);
    const map = await collectPartialBlocksMap([partialRef("p1", "A")], new Map(), true, TEST_APP_ID);
    expect([...map.keys()].sort()).toEqual(["A", "B"]);
    expect(map.get("B")).toEqual([block({ _id: "b1" })]);
  });

  it("never refetches a dangling reference", async () => {
    const map = await collectPartialBlocksMap([partialRef("p1", "ghost")], new Map(), true, TEST_APP_ID);
    expect(map.size).toBe(0);
  });

  it("reads published partials from the online table when not in draft", async () => {
    await withTestDB(async ({ seed }) => {
      await seed("appPagesOnline", { id: "A", pageType: "global", blocks: [block({ _id: "a-live" })] });
    });
    await seedPartials([{ id: "A", blocks: [block({ _id: "a-draft" })] }]);

    const map = await collectPartialBlocksMap([partialRef("p1", "A")], new Map(), false, TEST_APP_ID);
    expect(map.get("A")).toEqual([block({ _id: "a-live" })]);
  });

  it("terminates on cyclic references", async () => {
    await seedPartials([
      { id: "A", blocks: [partialRef("a1", "B")] },
      { id: "B", blocks: [partialRef("b1", "A")] },
    ]);
    const map = await collectPartialBlocksMap([partialRef("p1", "A")], new Map(), true, TEST_APP_ID);
    expect([...map.keys()].sort()).toEqual(["A", "B"]);
  });

  it("throws when the partial fetch fails instead of silently dropping partials", async () => {
    await withTableUnavailable(schema.appPages, async () => {
      const error = await collectPartialBlocksMap([partialRef("p1", "A")], new Map(), true, TEST_APP_ID).catch(
        (e: unknown) => e,
      );
      expect((error as Error).message).toBe("FAILED_TO_FETCH_PARTIAL_BLOCKS");
      expect((error as Error).cause).toBeInstanceOf(Error);
    });
  });
});

describe("computePartialIdsClosure", () => {
  it("returns the transitive closure of existing partials", async () => {
    await seedPartials([
      { id: "A", blocks: [partialRef("a1", "B")] },
      { id: "B", blocks: [] },
    ]);
    const closure = await computePartialIdsClosure([partialRef("p1", "A"), partialRef("p2", "missing")], TEST_APP_ID);
    expect(closure.sort()).toEqual(["A", "B"]);
  });

  it("returns an empty closure for blocks without partials", async () => {
    // No query may run: the table is unavailable, so a query would throw.
    const closure = await withTableUnavailable(schema.appPages, () =>
      computePartialIdsClosure([block({ _id: "x" })], TEST_APP_ID),
    );
    expect(closure).toEqual([]);
  });

  it("returns a deterministic sorted closure regardless of DB result order", async () => {
    await seedPartials([
      { id: "zeta", blocks: [] },
      { id: "alpha", blocks: [] },
    ]);
    const closure = await computePartialIdsClosure([partialRef("p1", "zeta"), partialRef("p2", "alpha")], TEST_APP_ID);
    expect(closure).toEqual(["alpha", "zeta"]);
  });
});
