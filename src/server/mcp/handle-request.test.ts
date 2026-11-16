import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getInitializedStateWithUser } from "~/server/chai-builder/state";
import type { ChaiBuilderInstance } from "~/types/chaibuilder-instance";
import type { ChaiMcpToolCallEvent, ChaiMcpToolContext } from "~/types/mcp";
import { createChaiMcpRouteHandlers, handleChaiMcpRequest, type ChaiMcpHandlerOptions } from "./handle-request";
import { defineChaiMcpTool, registerChaiMcpTools, resetChaiMcpRegistryForTests } from "./registry";
import { getChaiMcpRequestContext, recordChaiMcpToolError } from "./request-context";
import { createChaiMcpResponse } from "./response";

const SERVER_INFO = { name: "test", version: "0.0.0" };

type FakeContext = {
  appId: string;
  userId: string | null;
  permissions: string[] | null;
  delegatedPermissions?: string[] | null;
  surface?: string | null;
};

const fakeCb = (context: Partial<FakeContext> = {}): ChaiBuilderInstance<any> =>
  ({
    context: {
      appId: "app-1",
      userId: "user-1",
      permissions: ["pages:read", "pages:update"],
      ...context,
    },
  }) as unknown as ChaiBuilderInstance<any>;

const rpc = (method: string, params?: unknown, id: number | string = 1) =>
  new Request("https://example.com/api/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });

async function call(
  method: string,
  params?: unknown,
  { cb = fakeCb(), options = {} }: { cb?: ChaiBuilderInstance<any>; options?: Partial<ChaiMcpHandlerOptions> } = {},
) {
  const response = await handleChaiMcpRequest(cb, rpc(method, params), { serverInfo: SERVER_INFO, ...options });
  return { response, body: response.status === 200 ? await response.json() : undefined };
}

const readTool = defineChaiMcpTool(
  {
    name: "read_thing",
    kind: "read",
    description: "Read a thing.",
    inputSchema: { id: z.string().describe("Thing id") },
    permissions: ["pages:read"],
  },
  async (args) => createChaiMcpResponse(`read ${args.id as string}`),
);

const publishTool = defineChaiMcpTool(
  {
    name: "publish_thing",
    kind: "publish",
    description: "Publish a thing.",
    inputSchema: {},
    permissions: ["pages:publish"],
  },
  async () => createChaiMcpResponse("published"),
);

describe("handleChaiMcpRequest", () => {
  beforeEach(() => {
    resetChaiMcpRegistryForTests();
    registerChaiMcpTools("test", [readTool, publishTool]);
  });

  describe("transport", () => {
    it("answers GET and DELETE with 405 rather than holding a stream open", async () => {
      for (const method of ["GET", "DELETE"]) {
        const response = await handleChaiMcpRequest(fakeCb(), new Request("https://example.com/api/mcp", { method }), {
          serverInfo: SERVER_INFO,
        });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("POST");
      }
    });

    it("rejects a body over the limit before parsing it", async () => {
      const request = new Request("https://example.com/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(200) } }),
      });
      const response = await handleChaiMcpRequest(fakeCb(), request, { serverInfo: SERVER_INFO, maxBodyBytes: 100 });
      expect(response.status).toBe(413);
    });

    it("serves tools/list without a prior initialize (stateless)", async () => {
      const { body } = await call("tools/list");
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_thing"]);
    });
  });

  describe("authentication", () => {
    it("challenges a request with no Authorization header", async () => {
      const request = new Request("https://example.com/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const response = await handleChaiMcpRequest(fakeCb(), request, { serverInfo: SERVER_INFO });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('Bearer realm="https://example.com"');
    });

    it("advertises where to authenticate when the host supplies resource metadata", async () => {
      const request = new Request("https://example.com/api/mcp", { method: "POST", body: "{}" });
      const response = await handleChaiMcpRequest(fakeCb(), request, {
        serverInfo: SERVER_INFO,
        resourceMetadataUrl: "https://example.com/.well-known/oauth-protected-resource",
      });

      expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
      );
    });

    it("challenges when the resolver did not recognise the credential", async () => {
      const { response } = await call("tools/list", undefined, { cb: fakeCb({ userId: null }) });
      expect(response.status).toBe(401);
    });

    it("challenges when the user is not a member of this app", async () => {
      const { response } = await call("tools/list", undefined, { cb: fakeCb({ permissions: null }) });
      expect(response.status).toBe(401);
    });

    it("never accepts an ambient cookie as the credential", async () => {
      const seen: Array<string | undefined> = [];
      const { GET: _get, POST } = createChaiMcpRouteHandlers({
        serverInfo: SERVER_INFO,
        getChaiBuilder: (request) => {
          seen.push(request.cookies.get("payload-token")?.value);
          return fakeCb();
        },
      });

      const request = new Request("https://example.com/api/mcp", {
        method: "POST",
        headers: { cookie: "payload-token=stolen", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const response = await POST(request);

      expect(seen).toEqual([undefined]);
      expect(response.status).toBe(401);
    });

    it("refuses a credential that lacks the connect permission", async () => {
      const onAuthFailure = vi.fn();
      const { response } = await call("tools/list", undefined, {
        options: { connectPermission: "mcp:use", onAuthFailure },
      });

      expect(response.status).toBe(403);
      expect(onAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "forbidden", missingPermission: "mcp:use" }),
      );
    });

    it("admits a credential that holds the connect permission", async () => {
      const { response } = await call("tools/list", undefined, {
        cb: fakeCb({ permissions: ["mcp:use", "pages:read"] }),
        options: { connectPermission: "mcp:use" },
      });
      expect(response.status).toBe(200);
    });
  });

  describe("permission gating", () => {
    it("hides tools the caller cannot invoke", async () => {
      const { body } = await call("tools/list", undefined, { cb: fakeCb({ permissions: ["pages:read"] }) });
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_thing"]);
    });

    it("lists every tool when hiding is turned off", async () => {
      const { body } = await call("tools/list", undefined, { options: { hideUngrantedTools: false } });
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_thing", "publish_thing"]);
    });

    it("denies a hidden tool that is called directly", async () => {
      const { body } = await call("tools/call", { name: "publish_thing", arguments: {} });
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("unknown tool");
    });

    it("re-checks permissions at call time even when listing was not filtered", async () => {
      const { body } = await call(
        "tools/call",
        { name: "publish_thing", arguments: {} },
        {
          options: { hideUngrantedTools: false },
        },
      );
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("missing permission pages:publish");
    });

    it("applies the transport's delegation ceiling on top of the user's grants", async () => {
      const { body } = await call("tools/list", undefined, {
        cb: fakeCb({ permissions: ["*"] }),
        options: { delegatedPermissions: ["pages:read"], hideUngrantedTools: true },
      });
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_thing"]);
    });

    it("honours a host tool filter after the permission filter", async () => {
      const { body } = await call("tools/list", undefined, {
        options: { hideUngrantedTools: false, toolFilter: (tool) => tool.kind !== "publish" },
      });
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_thing"]);
    });
  });

  describe("tool calls", () => {
    it("runs the handler and returns its content", async () => {
      const { body } = await call("tools/call", { name: "read_thing", arguments: { id: "abc" } });
      expect(body.result.content[0].text).toBe("read abc");
      expect(body.result.isError).toBeUndefined();
    });

    it("rejects arguments over the size limit", async () => {
      const { body } = await call(
        "tools/call",
        { name: "read_thing", arguments: { id: "x".repeat(500) } },
        {
          options: { maxArgsBytes: 100 },
        },
      );
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("arguments are too large");
    });

    it("measures the size limit in bytes, not UTF-16 code units", async () => {
      // 60 characters, 180 bytes in UTF-8. A `.length` check would wave this through a
      // 100-byte cap and hand the handler a payload nearly twice the advertised limit.
      const { body } = await call(
        "tools/call",
        { name: "read_thing", arguments: { id: "字".repeat(60) } },
        { options: { maxArgsBytes: 100 } },
      );
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("arguments are too large");
    });

    it("reports invalid arguments instead of letting the handler fail on them", async () => {
      const { body } = await call("tools/call", { name: "read_thing", arguments: { id: 42 } });
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("invalid arguments");
    });

    it("sanitizes an internal error but hands the real one to the audit hook", async () => {
      const onToolCall = vi.fn();
      const boom = new Error("connect ECONNREFUSED postgres://user:hunter2@10.0.0.1:5432");
      registerChaiMcpTools("test", [
        defineChaiMcpTool(
          { name: "boom_tool", kind: "read", description: "", inputSchema: {}, permissions: [] },
          async () => {
            throw boom;
          },
        ),
      ]);

      const { body } = await call("tools/call", { name: "boom_tool", arguments: {} }, { options: { onToolCall } });

      expect(body.result.content[0].text).toBe("Error: The request could not be completed.");
      expect(body.result.content[0].text).not.toContain("hunter2");
      expect(onToolCall).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error", error: boom }));
    });

    it("hands the audit hook an error the handler caught and reported itself", async () => {
      // Most handlers catch, so that they can say which operation failed. The message
      // they return is sanitized on their side; without recordChaiMcpToolError the
      // original would be lost entirely, and the audit trail would hold only the
      // generic line.
      const onToolCall = vi.fn();
      const boom = new Error("relation app_pages does not exist");
      registerChaiMcpTools("test", [
        defineChaiMcpTool(
          { name: "caught_tool", kind: "read", description: "", inputSchema: {}, permissions: [] },
          async () => {
            recordChaiMcpToolError(boom);
            return createChaiMcpResponse("Error: Failed to read the page.");
          },
        ),
      ]);

      const { body } = await call("tools/call", { name: "caught_tool", arguments: {} }, { options: { onToolCall } });

      expect(body.result.content[0].text).not.toContain("app_pages");
      expect(onToolCall).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error", error: boom }));
    });
  });

  describe("context", () => {
    it("exposes the MCP request context and the mcp surface to handlers", async () => {
      let seen: { ctx?: ChaiMcpToolContext; ambient?: unknown; surface?: string | null } = {};
      registerChaiMcpTools("test", [
        defineChaiMcpTool(
          { name: "probe_tool", kind: "read", description: "", inputSchema: {}, permissions: [] },
          async (_args, ctx) => {
            seen = {
              ctx,
              ambient: getChaiMcpRequestContext(),
              surface: getInitializedStateWithUser().surface,
            };
            return createChaiMcpResponse("ok");
          },
        ),
      ]);

      await call("tools/call", { name: "probe_tool", arguments: {} });

      expect(seen.ctx?.toolName).toBe("probe_tool");
      expect(seen.ctx?.userId).toBe("user-1");
      expect(seen.ctx?.appId).toBe("app-1");
      expect(seen.ambient).toBeDefined();
      // Attribution: revisions written from here record `mcp`, not `builder`.
      expect(seen.surface).toBe("mcp");
    });

    it("clamps the permissions handed to the tool by the ceiling", async () => {
      let permissions: string[] = [];
      registerChaiMcpTools("test", [
        defineChaiMcpTool(
          { name: "probe_tool", kind: "read", description: "", inputSchema: {}, permissions: [] },
          async (_args, ctx) => {
            permissions = ctx.permissions;
            return createChaiMcpResponse("ok");
          },
        ),
      ]);

      await call(
        "tools/call",
        { name: "probe_tool", arguments: {} },
        {
          cb: fakeCb({ permissions: ["pages:read", "pages:publish"] }),
          options: { delegatedPermissions: ["pages:read"] },
        },
      );

      expect(permissions).toEqual(["pages:read"]);
    });

    it("reports page and detail recorded by the handler to the audit hook", async () => {
      const events: ChaiMcpToolCallEvent[] = [];
      registerChaiMcpTools("test", [
        defineChaiMcpTool(
          { name: "probe_tool", kind: "write", description: "", inputSchema: { secret: z.string() }, permissions: [] },
          async (_args, ctx) => {
            ctx.page = { id: "page-1", slug: "/about" };
            ctx.detail.blocksChanged = 3;
            return createChaiMcpResponse("ok");
          },
        ),
      ]);

      await call(
        "tools/call",
        { name: "probe_tool", arguments: { secret: "hunter2" } },
        {
          options: { onToolCall: (event) => void events.push(event) },
        },
      );

      expect(events[0]).toMatchObject({
        toolName: "probe_tool",
        outcome: "ok",
        page: { id: "page-1", slug: "/about" },
        detail: { blocksChanged: 3 },
      });
      // Secrets never reach the host's logs verbatim.
      expect(events[0].args).toEqual({ secret: "[redacted]" });
    });

    it("never lets a failing audit hook fail the call", async () => {
      const { body } = await call(
        "tools/call",
        { name: "read_thing", arguments: { id: "abc" } },
        {
          options: {
            onToolCall: () => {
              throw new Error("sink down");
            },
          },
        },
      );
      expect(body.result.content[0].text).toBe("read abc");
    });
  });

  describe("initialize", () => {
    it("returns server info and instructions built from the visible tools", async () => {
      const { body } = await call(
        "initialize",
        { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
        { options: { instructions: (_rendered, ctx) => `tools: ${ctx.permissions.join(",")}` } },
      );

      expect(body.result.serverInfo).toMatchObject({ name: "test" });
      expect(body.result.instructions).toBe("tools: pages:read,pages:update");
    });
  });
});
