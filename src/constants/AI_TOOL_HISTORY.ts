/**
 * Sentinel that replaces bulky `html` tool inputs in pruned model history.
 * Shared so the server prune and the client guard stay in lockstep — the
 * client must never render this string as if it were real block markup.
 */
export const AI_OMITTED_HTML_SENTINEL = "[html omitted — read the block again if needed]";

/**
 * Tools the client must execute against the Jotai block store (no server execute()).
 * Kept in this dependency-free constants module so client hooks never import
 * server-only modules (`ai-edit-page-tools.ts` -> `node:dns/promises`, `db`, etc.).
 */
export const CLIENT_EXECUTED_AI_EDIT_TOOLS = [
  "update_block_props",
  "edit_block",
  "add_blocks",
  "remove_blocks",
  "add_custom_block",
  "add_library_block",
  "bind_prop",
  "update_block_translations",
] as const;
