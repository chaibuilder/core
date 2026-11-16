/**
 * @vitest-environment happy-dom
 */
import { waitFor } from "@testing-library/react";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { isAIAction, useAiRequestHelper } from "../use-ai-request-helper";

const SITE = { name: "Test Site", description: "Test Description" };
const PAGE = { title: "Test Page", slug: "test-page" };
const FULL_CONTEXT = { site: SITE, page: PAGE };

/**
 * Renders the real hook on page `page-1`: useAiContext resolves the active page from the URL and
 * GET_WEBSITE_PAGES, then loads AI_GET_CONTEXT. `aiReply` is the server's AI_GET_CONTEXT reply.
 * Resolves once the context query has settled.
 */
const renderHelper = async (aiReply: unknown = { success: true, aiData: { app: SITE, page: PAGE } }) => {
  mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, [{ id: "page-1", name: "Home", slug: "/", pageType: "page" }]);
  const aiContext = mockChaiAction(ACTIONS.AI_GET_CONTEXT, aiReply);
  const rendered = renderHookInBuilder(() => useAiRequestHelper());
  await waitFor(() => expect(aiContext.calls).toHaveLength(1));
  // `data` stays undefined until the query resolves (to the context, or null when there is none).
  await waitFor(() => expect(rendered.result.current.aiContext).not.toBeUndefined());
  return rendered;
};

describe("isAIAction", () => {
  it("should identify GENERATE_SEO_FIELD as AI action", () => {
    expect(isAIAction(ACTIONS.AI_GENERATE_SEO_FIELD)).toBe(true);
  });

  it("should identify AI_ENHANCE_CONTEXT as AI action", () => {
    expect(isAIAction(ACTIONS.AI_ENHANCE_CONTEXT)).toBe(true);
  });

  it("should handle non-AI actions correctly", () => {
    expect(isAIAction("CREATE_PAGE")).toBe(false);
    expect(isAIAction("UPDATE_PAGE")).toBe(false);
    expect(isAIAction("DELETE_PAGE")).toBe(false);
    expect(isAIAction("GET_WEBSITE_DATA")).toBe(false);
  });
});

describe("useAiRequestHelper", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?page=page-1");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  describe("Context Injection", () => {
    it("should inject AI context when includeContext is true", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test prompt" }, { includeContext: true });

      expect(prepared.data.context).toEqual(FULL_CONTEXT);
    });

    it("should not inject context when includeContext is false", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test prompt" }, { includeContext: false });

      expect(prepared.data.context).toBeUndefined();
    });

    it("should inject context by default (includeContext not specified)", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test prompt" });

      expect(prepared.data.context).toBeDefined();
    });

    it("keeps the site design system and page brief out of the injected context", async () => {
      // Saved by the MCP design-system tools; the builder's AI flows must not see them.
      const { result } = await renderHelper({
        success: true,
        aiData: {
          app: { ...SITE, designSystem: { northStar: "Flour and fire", enabled: true } },
          page: { ...PAGE, designBrief: { mode: "persuade", thesis: "Bread first" } },
        },
      });
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test prompt" }, { includeContext: true });

      expect(prepared.data.context).toEqual(FULL_CONTEXT);
    });

    it("should handle missing AI context gracefully", async () => {
      // The server has no AI context for the page: useAiContext resolves to null.
      const { result } = await renderHelper({ success: false });
      expect(result.current.aiContext).toBeNull();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test prompt" }, { includeContext: true });

      expect(prepared.data.context).toEqual({});
    });

    it("should merge context with existing data", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(
        ACTIONS.AI_GENERATE_SEO_FIELD,
        { field: "title", keyword: "test", existingField: "value" },
        { includeContext: true },
      );

      expect(prepared.data).toEqual({
        field: "title",
        keyword: "test",
        existingField: "value",
        context: FULL_CONTEXT,
      });
    });

    it("should not override existing context in data", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const existingContext = { custom: "context" };
      const prepared = prepareAIRequest(
        ACTIONS.AI_EDIT_PAGE,
        { prompt: "test", context: existingContext },
        { includeContext: true },
      );

      expect(prepared.data.context).toEqual(existingContext);
    });
  });

  describe("AI Action Detection", () => {
    it("should not inject context for non-AI actions", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest("CREATE_PAGE", { slug: "test-page" }, { includeContext: true });

      expect(prepared.data.context).toBeUndefined();
    });

    it("should inject context for GENERATE_SEO_FIELD action", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_GENERATE_SEO_FIELD, { field: "title" }, { includeContext: true });

      expect(prepared.data.context).toBeDefined();
    });

    it("should inject context for AI_ENHANCE_CONTEXT action", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_ENHANCE_CONTEXT, { text: "test" }, { includeContext: true });

      expect(prepared.data.context).toBeDefined();
    });
  });

  describe("Request Preparation", () => {
    it("should format request data correctly", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(
        ACTIONS.AI_EDIT_PAGE,
        { prompt: "test", model: "gpt-4" },
        { includeContext: true },
      );

      expect(prepared).toHaveProperty("action");
      expect(prepared).toHaveProperty("data");
      expect(prepared.action).toBe(ACTIONS.AI_EDIT_PAGE);
      expect(prepared.data.prompt).toBe("test");
      expect(prepared.data.model).toBe("gpt-4");
    });

    it("should preserve all original data fields", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const originalData = {
        field1: "value1",
        field2: "value2",
        field3: { nested: "value" },
        field4: [1, 2, 3],
      };

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, originalData, { includeContext: true });

      expect(prepared.data.field1).toBe("value1");
      expect(prepared.data.field2).toBe("value2");
      expect(prepared.data.field3).toEqual({ nested: "value" });
      expect(prepared.data.field4).toEqual([1, 2, 3]);
    });

    it("should add context to correct location in data", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test" }, { includeContext: true });

      expect(prepared.data).toHaveProperty("context");
      expect(prepared.data.context).toHaveProperty("site");
      expect(prepared.data.context).toHaveProperty("page");
    });

    it("should handle nested data structures", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const complexData = {
        level1: {
          level2: {
            level3: "deep value",
          },
          array: [{ id: 1 }, { id: 2 }],
        },
        topLevel: "value",
      };

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, complexData, { includeContext: true });

      expect(prepared.data.level1.level2.level3).toBe("deep value");
      expect(prepared.data.level1.array).toHaveLength(2);
      expect(prepared.data.topLevel).toBe("value");
      expect(prepared.data.context).toBeDefined();
    });

    it("should handle empty data object", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, {}, { includeContext: true });

      expect(prepared.data).toEqual({ context: FULL_CONTEXT });
    });

    it("should handle null data", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, null as any, { includeContext: true });

      expect(prepared.data).toHaveProperty("context");
    });

    it("should return action unchanged", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const testAction = ACTIONS.AI_GENERATE_SEO_FIELD;
      const prepared = prepareAIRequest(testAction, { test: "data" });

      expect(prepared.action).toBe(testAction);
    });
  });

  describe("aiContext property", () => {
    it("should expose aiContext from hook", async () => {
      const { result } = await renderHelper();

      expect(result.current.aiContext).toEqual(FULL_CONTEXT);
    });

    it("should expose isAIAction function", async () => {
      const { result } = await renderHelper();

      expect(result.current.isAIAction).toBe(isAIAction);
      expect(result.current.isAIAction(ACTIONS.AI_EDIT_PAGE)).toBe(true);
      expect(result.current.isAIAction("CREATE_PAGE")).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined options parameter", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test" }, undefined);

      expect(prepared.data.context).toBeDefined();
    });

    it("should handle empty options object", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test" }, {});

      expect(prepared.data.context).toBeDefined();
    });

    it("should handle partial AI context (only site)", async () => {
      const { result } = await renderHelper({ success: true, aiData: { app: { name: "Site Only" } } });
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test" }, { includeContext: true });

      expect(prepared.data.context).toEqual({ site: { name: "Site Only" } });
    });

    it("should handle partial AI context (only page)", async () => {
      const { result } = await renderHelper({ success: true, aiData: { page: { title: "Page Only" } } });
      const { prepareAIRequest } = result.current;

      const prepared = prepareAIRequest(ACTIONS.AI_EDIT_PAGE, { prompt: "test" }, { includeContext: true });

      expect(prepared.data.context).toEqual({ page: { title: "Page Only" } });
    });

    it("should not mutate original data object", async () => {
      const { result } = await renderHelper();
      const { prepareAIRequest } = result.current;

      const originalData = { prompt: "test", existing: "field" };
      const originalDataCopy = { ...originalData };

      prepareAIRequest(ACTIONS.AI_EDIT_PAGE, originalData, { includeContext: true });

      expect(originalData).toEqual(originalDataCopy);
    });
  });
});
