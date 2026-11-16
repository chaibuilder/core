import { runInFreshContext } from "~/server/chai-builder/state";
import { setChaiContextResolver } from "~/server/chai-context-resolver";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { getChaiBuilder, resetChaiBuilderCoreForTests } from "~/server/get-chaibuilder";
import { runWithChaiMcpRequest, runWithChaiMcpToolContext } from "~/server/mcp/request-context";
import { resetSharedChaiRequestContextForTests } from "~/server/resolve-chai-context";
import type { ChaiRequestContext } from "~/types/chaibuilder-config";
import type { ChaiMcpRequestContext, ChaiMcpToolContext } from "~/types/mcp";
// Side effect: the full edition config (MCP, revisions, media… plugins) is the baseline.
import "./chai-config";
import { testRequestContext } from "./request-context";

export type McpRequestOverrides = Partial<ChaiRequestContext> & {
  /** Tool name recorded on the tool context. Default `"test_tool"`. */
  toolName?: string;
  /** Host extras carried on the request context (and the audit event). */
  extra?: Record<string, unknown>;
};

/**
 * Runs `fn` as one MCP tool call, the way `handleChaiMcpRequest` does: a real ChaiBuilder
 * instance built by `getChaiBuilder` over the active config for the test app and user,
 * the MCP request context and a fresh tool context around it. Pass `fn`'s argument to the
 * handler as its `ctx`; `ctx.detail` / `ctx.error` hold what the handler recorded for audit.
 *
 * Defaults: `permissions: ["*"]`, `surface: "mcp"`, `draft: true`, `lang: "en"`. Override
 * `permissions` (or `delegatedPermissions`) to exercise the real 403 path.
 */
export async function withMcpRequest<T>(
  fn: (ctx: ChaiMcpToolContext) => Promise<T> | T,
  overrides: McpRequestOverrides = {},
): Promise<T> {
  const { toolName = "test_tool", extra = {}, ...contextOverrides } = overrides;
  const context = testRequestContext({ permissions: ["*"], surface: "mcp", ...contextOverrides, draft: true });

  // The harness restores the edition's own resolver after every test.
  setChaiContextResolver(async () => context);
  resetSharedChaiRequestContextForTests();
  resetChaiBuilderCoreForTests();
  try {
    const cb = await getChaiBuilder(getActiveChaiBuilderConfig(), { params: Promise.resolve({}) });
    const mcpContext: ChaiMcpRequestContext = {
      cb,
      request: new Request("https://mcp.test/api/mcp", { method: "POST" }),
      appId: context.appId,
      userId: context.userId as string,
      permissions: context.permissions ?? [],
      surface: context.surface ?? "mcp",
      extra,
    };
    return await runInFreshContext(cb.context, () =>
      runWithChaiMcpRequest(mcpContext, () => runWithChaiMcpToolContext(toolName, (ctx) => fn(ctx))),
    );
  } finally {
    resetSharedChaiRequestContextForTests();
    resetChaiBuilderCoreForTests();
  }
}
