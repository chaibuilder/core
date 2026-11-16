/**
 * @vitest-environment happy-dom
 *
 * Boundary cases at the real MAX_PARTIAL_DEPTH (3). This file used to mock the
 * constant to 3 while the default was 2; the product default is now 3, so the
 * rules are exercised against the real constant (guarded below so a future
 * change to the limit fails loudly here instead of silently shifting meaning).
 */
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCheckPartialCanAdd } from "~/builder/hooks/partial-blocks/use-partial-can-add";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";

type GraphSetup = {
  pageId: string;
  dependencies?: Record<string, string[]>;
  partialPages?: string[];
};

/** Partials are pages with an empty slug; `partialBlocks` ("A|B") lists the partials each contains. */
const check = async ({ pageId, dependencies = {}, partialPages = [] }: GraphSetup, targetId: string) => {
  mockChaiAction(
    ACTIONS.GET_WEBSITE_PAGES,
    partialPages.map((id) => ({ id, slug: "", partialBlocks: (dependencies[id] ?? []).join("|") })),
  );
  const { result } = renderHookInBuilder(() => ({ check: useCheckPartialCanAdd(), pages: useWebsitePrimaryPages() }), {
    builderProps: { pageId },
  });
  await waitFor(() => expect(result.current.pages.isFetched).toBe(true));
  return result.current.check(targetId);
};

describe("useCheckPartialCanAdd with MAX_PARTIAL_DEPTH = 3", () => {
  it("runs against a limit of 3", () => {
    expect(MAX_PARTIAL_DEPTH).toBe(3);
  });

  it("allows a 3-deep chain on a regular page (page -> A -> B -> C)", async () => {
    const result = await check(
      { pageId: "page-1", partialPages: ["A", "B", "C"], dependencies: { A: ["B"], B: ["C"], C: [] } },
      "A",
    );
    expect(result.canAdd).toBe(true);
  });

  it("blocks a 4-deep chain on a regular page", async () => {
    const result = await check(
      {
        pageId: "page-1",
        partialPages: ["A", "B", "C", "D"],
        dependencies: { A: ["B"], B: ["C"], C: ["D"], D: [] },
      },
      "A",
    );
    expect(result.canAdd).toBe(false);
  });

  it("allows a partial containing a partial inside a top-level partial", async () => {
    // Editing A (used nowhere): adding B (which contains C) => A -> B -> C = 3
    const result = await check(
      { pageId: "A", partialPages: ["A", "B", "C"], dependencies: { A: [], B: ["C"], C: [] } },
      "B",
    );
    expect(result.canAdd).toBe(true);
  });

  it("blocks a 3-deep partial inside a partial", async () => {
    const result = await check(
      {
        pageId: "A",
        partialPages: ["A", "B", "C", "D"],
        dependencies: { A: [], B: ["C"], C: ["D"], D: [] },
      },
      "B",
    );
    expect(result.canAdd).toBe(false);
  });

  it("allows a leaf partial inside a partial that is nested one level deep", async () => {
    // Outer -> A already; adding leaf B => Outer -> A -> B = 3
    const result = await check(
      { pageId: "A", partialPages: ["A", "B", "Outer"], dependencies: { Outer: ["A"], A: [], B: [] } },
      "B",
    );
    expect(result.canAdd).toBe(true);
  });

  it("blocks a non-leaf partial inside a partial that is nested one level deep", async () => {
    const result = await check(
      {
        pageId: "A",
        partialPages: ["A", "B", "C", "Outer"],
        dependencies: { Outer: ["A"], A: [], B: ["C"], C: [] },
      },
      "B",
    );
    expect(result.canAdd).toBe(false);
  });

  it("blocks everything inside a partial nested two levels deep", async () => {
    // Top -> Outer -> A: A sits at level 3 already
    const result = await check(
      {
        pageId: "A",
        partialPages: ["A", "B", "Outer", "Top"],
        dependencies: { Top: ["Outer"], Outer: ["A"], A: [], B: [] },
      },
      "B",
    );
    expect(result.canAdd).toBe(false);
    expect(result.reason).toContain("used inside another Global Block");
  });
});
