import { toChaiActionErrorPayload } from "~/server/chai-actions/action-result";
import type { ChaiMcpToolResult } from "~/types/mcp";

/**
 * A tool result. MCP clients treat a result as success unless `isError` is set, and the
 * tools signal failure with an `Error:`-prefixed message, so that convention is
 * auto-flagged. An explicit `isError` always wins.
 * @internal
 */
export function createChaiMcpResponse(text: string, opts?: { isError?: boolean }): ChaiMcpToolResult {
  const isError = opts?.isError ?? text.startsWith("Error:");
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

/**
 * Turns a thrown error into a message safe to hand an MCP client.
 *
 * A caller-caused failure (a 4xx `ActionError`: missing permission, validation, not
 * found) carries a message written for the caller and is passed through — an agent that
 * is told "Missing permission: pages:publish" can stop, where an opaque failure makes it
 * retry. Anything else is a bug or an infrastructure failure whose message can carry
 * connection strings, SQL or internal paths, so only a generic line goes out; the real
 * error reaches the host through the audit hook.
 */
export function toSafeChaiMcpError(error: unknown, fallback = "The request could not be completed."): string {
  const payload = toChaiActionErrorPayload(error);
  if (payload.status >= 400 && payload.status < 500 && payload.message) {
    return `Error: ${payload.message}`;
  }
  return `Error: ${fallback}`;
}
