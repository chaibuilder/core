import { hasPermission } from "~/server/rbac/permissions";
import type { ChaiMcpToolMeta } from "~/types/mcp";

/**
 * Whether a caller may invoke a tool. Fail-closed by construction: an unknown tool
 * (never registered, or registered after this caller's list was built) is denied rather
 * than falling through to "authenticated is enough".
 *
 * `permissions` must be the *effective* set — the user's grants already clamped by every
 * delegation ceiling — so a tool this answers `true` for is one whose actions will not
 * 403 underneath on a permission the ceiling removed.
 */
export function canInvokeChaiMcpTool(permissions: string[], tool: ChaiMcpToolMeta | undefined): boolean {
  if (!tool) return false;
  return tool.permissions.every((required) => hasPermission(permissions, required));
}

/** The permissions a caller is missing for a tool, for a message that says what to fix. */
export function missingChaiMcpToolPermissions(permissions: string[], tool: ChaiMcpToolMeta): string[] {
  return tool.permissions.filter((required) => !hasPermission(permissions, required));
}
