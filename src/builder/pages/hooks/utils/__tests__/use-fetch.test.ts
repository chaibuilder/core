/**
 * @vitest-environment happy-dom
 */
import { waitFor } from "@testing-library/react";
import {
  registerChaiFetchInterceptor,
  resetChaiFetchInterceptorsForTests,
} from "~/builder/register-apis/register-chai-fetch-interceptor";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { useFetch } from "../use-fetch";

const API_URL = "http://localhost/chai/api";

type CapturedRequest = { url: string; headers: Headers; action: string; data: any };

/**
 * Answers `action` on the real endpoint and records what actually went over the wire: the URL, the
 * headers and the `{ action, data }` body the hook sent.
 */
const captureAction = (action: string, reply: unknown = { success: true }) => {
  const requests: CapturedRequest[] = [];
  const mocked = mockChaiAction(action, async (data, request) => {
    requests.push({ url: request.url, headers: request.headers, action, data });
    return reply;
  });
  return { ...mocked, requests };
};

/** Renders the real hook with the host's pages props (getAccessToken / beforeRequest / onLogout). */
const renderFetch = (pagesProps: Record<string, unknown> = {}) =>
  renderHookInBuilder(() => useFetch(), {
    pagesProps: { apiUrl: API_URL, getAccessToken: vi.fn(async () => "mock-token"), onLogout: vi.fn(), ...pagesProps },
  });

describe("useFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetChaiFetchInterceptorsForTests();
  });

  describe("beforeRequest Hook Integration", () => {
    it("should call beforeRequest hook when provided", async () => {
      const mockBeforeRequest = vi.fn(async ({ action, data }) => ({ action, data }));
      captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } });

      expect(mockBeforeRequest).toHaveBeenCalledWith({
        action: "TEST_ACTION",
        data: { test: "value" },
      });
    });

    it("should pass correct action and data to beforeRequest", async () => {
      const mockBeforeRequest = vi.fn(async ({ action, data }) => ({ action, data }));
      captureAction("GENERATE_SEO_FIELD");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      const testData = { field: "title", keyword: "test" };
      await result.current(API_URL, { action: "GENERATE_SEO_FIELD", data: testData });

      expect(mockBeforeRequest).toHaveBeenCalledWith({
        action: "GENERATE_SEO_FIELD",
        data: testData,
      });
    });

    it("should use modified data from beforeRequest", async () => {
      const mockBeforeRequest = vi.fn(async ({ action, data }) => ({
        action,
        data: { ...data, modified: true, extra: "field" },
      }));
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { original: "value" } });

      expect(server.calls).toEqual([{ original: "value", modified: true, extra: "field" }]);
    });

    it("should use modified action from beforeRequest", async () => {
      const mockBeforeRequest = vi.fn(async ({ data }) => ({
        action: "MODIFIED_ACTION",
        data,
      }));
      const original = captureAction("ORIGINAL_ACTION");
      const modified = captureAction("MODIFIED_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "ORIGINAL_ACTION", data: {} });

      expect(original.calls).toHaveLength(0);
      expect(modified.requests).toHaveLength(1);
      expect(modified.requests[0].url).toBe(`${API_URL}?action=modified_action`);
      expect(modified.requests[0].data).toEqual({});
    });

    it("should cancel request when beforeRequest returns null", async () => {
      const mockBeforeRequest = vi.fn(async () => null);
      vi.spyOn(console, "log").mockImplementation(() => {});
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      const response = await result.current(API_URL, { action: "TEST_ACTION", data: {} });

      expect(response).toBeNull();
      expect(server.calls).toHaveLength(0);
    });

    it("should handle async beforeRequest (Promise return)", async () => {
      const mockBeforeRequest = vi.fn(
        ({ action, data }) =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ action, data: { ...data, async: true } }), 10);
          }),
      );
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } });

      await waitFor(() => {
        expect(server.calls).toEqual([{ test: "value", async: true }]);
      });
    });

    it("should handle sync beforeRequest (direct return)", async () => {
      const mockBeforeRequest = vi.fn(({ action, data }) => ({
        action,
        data: { ...data, sync: true },
      }));
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } });

      expect(server.calls).toEqual([{ test: "value", sync: true }]);
    });
  });

  describe("Error Handling", () => {
    it("should handle errors thrown in beforeRequest hook", async () => {
      const mockBeforeRequest = vi.fn(async () => {
        throw new Error("beforeRequest error");
      });
      const server = captureAction("TEST_ACTION");
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      // Should continue with original request despite error
      await result.current(API_URL, { action: "TEST_ACTION", data: {} });

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error in beforeRequest hook:", expect.any(Error));
      expect(server.calls).toHaveLength(1);
    });

    it("should not break when beforeRequest returns invalid data", async () => {
      const mockBeforeRequest = vi.fn(async () => "invalid" as any);
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      // Should use original request when return is invalid
      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } });

      expect(server.calls).toEqual([{ test: "value" }]);
    });

    it("should log errors from beforeRequest appropriately", async () => {
      const testError = new Error("Test error in hook");
      const mockBeforeRequest = vi.fn(async () => {
        throw testError;
      });
      captureAction("TEST_ACTION");
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: {} });

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error in beforeRequest hook:", testError);
    });

    it("should continue with original request if beforeRequest fails", async () => {
      const mockBeforeRequest = vi.fn(async () => {
        throw new Error("Hook failed");
      });
      const server = captureAction("TEST_ACTION");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      const originalData = { test: "original" };
      await result.current(API_URL, { action: "TEST_ACTION", data: originalData });

      expect(server.calls).toEqual([originalData]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle beforeRequest returning undefined", async () => {
      const mockBeforeRequest = vi.fn(async () => undefined as any);
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } });

      expect(server.calls).toEqual([{ test: "value" }]);
    });

    it("should handle beforeRequest modifying only action", async () => {
      const mockBeforeRequest = vi.fn(async ({ data }) => ({
        action: "NEW_ACTION",
        data,
      }));
      const server = captureAction("NEW_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "OLD_ACTION", data: { test: "value" } });

      expect(server.requests).toHaveLength(1);
      expect(server.requests[0].url).toBe(`${API_URL}?action=new_action`);
      expect(server.requests[0].data).toEqual({ test: "value" });
    });

    it("should handle beforeRequest modifying only data", async () => {
      const mockBeforeRequest = vi.fn(async ({ action }) => ({
        action,
        data: { modified: "data" },
      }));
      const server = captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: { original: "value" } });

      expect(server.calls).toEqual([{ modified: "data" }]);
    });

    it("should handle beforeRequest with empty data object", async () => {
      const mockBeforeRequest = vi.fn(async ({ action, data }) => ({ action, data }));
      captureAction("TEST_ACTION");
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      await result.current(API_URL, { action: "TEST_ACTION", data: {} });

      expect(mockBeforeRequest).toHaveBeenCalledWith({
        action: "TEST_ACTION",
        data: {},
      });
    });

    it("should preserve headers and options when using beforeRequest", async () => {
      const mockBeforeRequest = vi.fn(async ({ action, data }) => ({
        action,
        data: { ...data, modified: true },
      }));
      const server = captureAction("TEST_ACTION");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderFetch({ beforeRequest: mockBeforeRequest });

      const customHeaders = { "X-Custom-Header": "test-value" };
      const abortController = new AbortController();

      await result.current(API_URL, { action: "TEST_ACTION", data: { test: "value" } }, customHeaders, false, {
        signal: abortController.signal,
      });

      expect(server.requests).toHaveLength(1);
      expect(server.requests[0].headers.get("x-custom-header")).toBe("test-value");
      expect(server.requests[0].headers.get("authorization")).toBe("Bearer mock-token");
      expect(server.requests[0].data).toEqual({ test: "value", modified: true });

      // The signal reaches the real fetch: an aborted one stops the request before it is sent.
      abortController.abort();
      await expect(
        result.current(API_URL, { action: "TEST_ACTION", data: {} }, customHeaders, false, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow();
      expect(server.requests).toHaveLength(1);
    });
  });

  describe("fetch interceptors", () => {
    it("merges interceptor headers under the caller's headers and Authorization", async () => {
      registerChaiFetchInterceptor("chai:test", {
        headers: ({ action }) => ({ "x-hint": `for-${action}`, "X-Custom-Header": "from-interceptor" }),
      });
      const server = captureAction("GET_PAGES", {});
      const { result } = renderFetch();

      await result.current(API_URL, { action: "GET_PAGES", data: {} }, { "X-Custom-Header": "caller" });

      const { headers } = server.requests[0];
      expect(headers.get("x-hint")).toBe("for-GET_PAGES");
      expect(headers.get("x-custom-header")).toBe("caller");
      expect(headers.get("authorization")).toBe("Bearer mock-token");
    });

    it("wins over interceptor headers spelled in a different case", async () => {
      registerChaiFetchInterceptor("chai:test", {
        headers: () => ({ authorization: "Bearer from-interceptor", "x-custom-header": "from-interceptor" }),
      });
      const server = captureAction("GET_PAGES", {});
      const { result } = renderFetch();

      await result.current(API_URL, { action: "GET_PAGES", data: {} }, { "X-Custom-Header": "caller" });

      // One Authorization, one custom header: the interceptor's spellings were replaced, not kept
      // (a duplicate would reach the server joined as "a, b").
      const { headers } = server.requests[0];
      expect(headers.get("authorization")).toBe("Bearer mock-token");
      expect(headers.get("x-custom-header")).toBe("caller");
    });

    it("hands the parsed body to onResponse on success and on 401", async () => {
      const onResponse = vi.fn();
      registerChaiFetchInterceptor("chai:test", { onResponse });
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { result } = renderFetch();

      mockChaiAction("GET_PAGES", { a: 1 });
      await result.current(API_URL, { action: "GET_PAGES", data: {} });

      expect(onResponse).toHaveBeenCalledWith({
        action: "GET_PAGES",
        status: 200,
        body: { ok: true, data: { a: 1 } },
      });

      mockChaiAction("GET_PAGES", { status: 401, message: "nope", code: "UNAUTHORIZED" }, { ok: false, status: 401 });
      await result.current(API_URL, { action: "GET_PAGES", data: {} });

      expect(onResponse).toHaveBeenLastCalledWith(expect.objectContaining({ status: 401 }));
    });

    it("logs and ignores a throwing interceptor so the request still succeeds", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      registerChaiFetchInterceptor("chai:broken", {
        headers: () => {
          throw new Error("headers boom");
        },
        onResponse: () => {
          throw new Error("response boom");
        },
      });
      captureAction("GET_PAGES", { fine: true });
      const { result } = renderFetch();

      const response = await result.current(API_URL, { action: "GET_PAGES", data: {} });

      expect(response).toEqual(expect.objectContaining({ fine: true }));
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it("skips onResponse for streaming responses", async () => {
      const onResponse = vi.fn();
      registerChaiFetchInterceptor("chai:test", { onResponse });
      captureAction("AI_CHAT", {});
      const { result } = renderFetch();

      const response = await result.current(API_URL, { action: "AI_CHAT", data: {} }, {}, true);

      // The raw Response comes back unread.
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).bodyUsed).toBe(false);
      expect(onResponse).not.toHaveBeenCalled();
    });
  });
});
