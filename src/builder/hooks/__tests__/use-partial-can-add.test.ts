/**
 * @vitest-environment happy-dom
 */
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCanAddPartial, useCheckPartialCanAdd } from "~/builder/hooks/partial-blocks/use-partial-can-add";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { createTestQueryClient, renderHookInBuilder } from "~/tests/builder/render-in-builder";

type GraphSetup = {
  pageId: string;
  dependencies?: Record<string, string[]>;
  partialPages?: string[];
  pageTypes?: Record<string, unknown>[];
};

/**
 * The real partial graph is built from the site's pages list (GET_WEBSITE_PAGES): a page with an
 * empty slug is a partial, and its `partialBlocks` column ("A|B") lists the partials it contains.
 */
const serveGraph = ({ dependencies = {}, partialPages = [] }: GraphSetup) => {
  mockChaiAction(
    ACTIONS.GET_WEBSITE_PAGES,
    partialPages.map((id) => ({ id, slug: "", partialBlocks: (dependencies[id] ?? []).join("|") })),
  );
};

const renderWithGraph = async <T>(setup: GraphSetup, hook: () => T) => {
  serveGraph(setup);
  const queryClient = createTestQueryClient();
  queryClient.setQueryData([ACTIONS.GET_PAGE_TYPES], setup.pageTypes ?? []);
  const rendered = renderHookInBuilder(() => ({ value: hook(), pages: useWebsitePrimaryPages() }), {
    builderProps: { pageId: setup.pageId },
    queryClient,
  });
  await waitFor(() => expect(rendered.result.current.pages.isFetched).toBe(true));
  return rendered;
};

const check = async (setup: GraphSetup, targetId: string) => {
  const { result } = await renderWithGraph(setup, () => useCheckPartialCanAdd());
  return result.current.value(targetId);
};

describe("useCheckPartialCanAdd", () => {
  it("allows everything when no page id is set", async () => {
    expect((await check({ pageId: "", partialPages: ["A"] }, "A")).canAdd).toBe(true);
  });

  describe("editing a regular page", () => {
    it("allows a partial-free partial", async () => {
      expect((await check({ pageId: "page-1", partialPages: ["A"] }, "A")).canAdd).toBe(true);
    });

    it("allows a partial one level deep (page -> A -> B)", async () => {
      const result = await check(
        { pageId: "page-1", partialPages: ["A", "B"], dependencies: { A: ["B"], B: [] } },
        "A",
      );
      expect(result.canAdd).toBe(true);
    });

    it("blocks a partial whose chain would exceed the depth limit", async () => {
      // MAX_PARTIAL_DEPTH = 3: page -> A -> B -> C is allowed, so the chain has
      // to reach four deep (A -> B -> C -> D) to exceed the limit.
      const result = await check(
        {
          pageId: "page-1",
          partialPages: ["A", "B", "C", "D"],
          dependencies: { A: ["B"], B: ["C"], C: ["D"], D: [] },
        },
        "A",
      );
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain("Maximum nesting depth");
    });
  });

  describe("editing a partial", () => {
    it("blocks adding the partial into itself", async () => {
      const result = await check({ pageId: "A", partialPages: ["A"] }, "A");
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain("itself");
    });

    it("names the single partial page type in the reason", async () => {
      const pageTypes = [{ key: "global", name: "Global Block", hasSlug: false }];
      const result = await check({ pageId: "A", partialPages: ["A"], pageTypes }, "A");
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain("Global Block");
    });

    it("blocks a circular reference (target contains the current partial)", async () => {
      const result = await check({ pageId: "A", partialPages: ["A", "B"], dependencies: { B: ["A"] } }, "B");
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain("circular");
    });

    it("allows a partial-free partial", async () => {
      const result = await check({ pageId: "A", partialPages: ["A", "B"], dependencies: { A: [], B: [] } }, "B");
      expect(result.canAdd).toBe(true);
    });

    it("blocks a partial that itself contains partials", async () => {
      // MAX_PARTIAL_DEPTH = 3: editing A (used nowhere), adding a partial that
      // is itself two deep (B -> C -> D) makes A -> B -> C -> D = 4, over the
      // limit. A single nested level (B -> C) would now be allowed.
      const result = await check(
        {
          pageId: "A",
          partialPages: ["A", "B", "C", "D"],
          dependencies: { A: [], B: ["C"], C: ["D"], D: [] },
        },
        "B",
      );
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain("contains other Global Blocks");
    });

    it("blocks all partials when the current partial is used inside another partial", async () => {
      // Top -> Outer -> A: A already sits at the maximum depth, so nothing more
      // can be added inside it (adding B would make level 4).
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
});

describe("useCanAddPartial", () => {
  it("delegates to the same rules", async () => {
    const { result } = await renderWithGraph({ pageId: "A", partialPages: ["A"] }, () => useCanAddPartial("A"));
    expect(result.current.value.canAdd).toBe(false);
  });
});
