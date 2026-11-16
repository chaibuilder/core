import type { ChaiActionContext, ChaiActionSurface } from "~/types/chai-action";

/** Written through an MCP/OAuth credential — i.e. by an agent, not a person in the builder. */
export const MCP_EDIT_SOURCE = "mcp";
/** Written by a person in an interactive builder session. */
export const BUILDER_EDIT_SOURCE = "builder";
/** Written by a person from a settings panel. Kept apart from `builder` so it never coalesces into the same person's open builder draft. */
export const SETTINGS_EDIT_SOURCE = "settings";
/** Written by the site/page clone service. */
export const CLONE_EDIT_SOURCE = "clone";
/** Written by another site through the inter-site secret. */
export const INTER_SITE_EDIT_SOURCE = "inter-site";
/**
 * Written under a service identity — a machine-to-machine entry point (site
 * clone dispatching theme/design-token actions, the inter-site asset upload)
 * that authenticated with a secret and runs with an explicit actor and a
 * narrow, delegation-capped grant set. Neither a person in the builder nor an
 * agent behind an MCP token; attributing it as either would lie in the history
 * UI and the activity log. Attributed via `context.surface` — service
 * dispatches stamp `surface: "service"`.
 */
export const SERVICE_EDIT_SOURCE = "service";

export type ChaiEditSource = ChaiActionSurface;

/**
 * How the current write reached us, for attribution on revision/online rows.
 * `context.surface` wins when the host's resolver stamped it (this is how a
 * service, clone or inter-site write is attributed); otherwise falls back to
 * the `mcp` role label, then `delegatedPermissions`, which can't tell a service
 * context (clone, inter-site, service) from an MCP token.
 */
export function resolveEditSource(context?: ChaiActionContext | null): ChaiEditSource {
  if (context?.surface) return context.surface;
  if (context?.userAccess?.role === MCP_EDIT_SOURCE) return MCP_EDIT_SOURCE;
  return context?.delegatedPermissions ? MCP_EDIT_SOURCE : BUILDER_EDIT_SOURCE;
}
