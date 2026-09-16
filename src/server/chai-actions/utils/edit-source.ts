import type { ChaiActionContext } from "~/types/chai-action";

/** Written through an MCP/OAuth credential — i.e. by an agent, not a person in the builder. */
export const MCP_EDIT_SOURCE = "mcp";
/** Written by a person in an interactive builder session. */
export const BUILDER_EDIT_SOURCE = "builder";

export type ChaiEditSource = typeof MCP_EDIT_SOURCE | typeof BUILDER_EDIT_SOURCE;

/**
 * How the current write reached us, for attribution on revision/online rows.
 *
 * Two signals, both already on the action context. The host's role label is
 * checked first because it is the explicit statement; `delegatedPermissions` is
 * the SDK-native fallback so this keeps working for hosts that label the role
 * differently — a delegation ceiling is only ever set for a credential
 * (OAuth app, MCP token), never for a browser session.
 */
export function resolveEditSource(context?: ChaiActionContext | null): ChaiEditSource {
  if (context?.userAccess?.role === MCP_EDIT_SOURCE) return MCP_EDIT_SOURCE;
  return context?.delegatedPermissions ? MCP_EDIT_SOURCE : BUILDER_EDIT_SOURCE;
}
