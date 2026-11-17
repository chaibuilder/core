/**
 * Deprecated names of `<pkg>/mcp`, re-exported by `./index.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `getRegisteredChaiMcpInstructions` from `<pkg>/mcp`. Kept for compatibility. */
  getRegisteredChaiMcpInstructions as getChaiMcpInstructionsSections,
  /** @deprecated Use `getRegisteredChaiMcpTool` from `<pkg>/mcp`. Kept for compatibility. */
  getRegisteredChaiMcpTool as getChaiMcpTool,
  /** @deprecated Use `getRegisteredChaiMcpTools` from `<pkg>/mcp`. Kept for compatibility. */
  getRegisteredChaiMcpTools as getChaiMcpTools,
  /** @deprecated Use `getMissingChaiMcpToolPermissions` from `<pkg>/mcp`. Kept for compatibility. */
  getMissingChaiMcpToolPermissions as missingChaiMcpToolPermissions,
} from "~/server/mcp/api";
