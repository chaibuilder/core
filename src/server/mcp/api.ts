/**
 * The SDK-free half of the MCP surface: everything needed to *define* and *register*
 * tools and instruction sections, plus the helpers their handlers call.
 *
 * Kept apart from `handle-request.ts` (the only module that imports
 * `@modelcontextprotocol/sdk`) so a plugin or app can contribute tools without the
 * optional peer being installed — an app that never mounts the MCP route pays nothing,
 * and a plugin that ships tools does not force the dependency on its consumers.
 */

export {
  defineChaiMcpInstructionsSection,
  defineChaiMcpTool,
  defineChaiMcpToolMeta,
  getRegisteredChaiMcpInstructions,
  getRegisteredChaiMcpTool,
  getRegisteredChaiMcpTools,
  registerChaiMcpInstructions,
  registerChaiMcpTool,
  registerChaiMcpTools,
  resetChaiMcpRegistryForTests,
  unregisterChaiMcpInstructions,
  unregisterChaiMcpTool,
  unregisterChaiMcpTools,
  type ChaiMcpRegisterOptions,
} from "./registry";

export {
  getChaiMcpRequestContext,
  getChaiMcpToolContext,
  recordChaiMcpPageContext,
  recordChaiMcpToolDetail,
  recordChaiMcpToolError,
  requireChaiMcpRequestContext,
  runWithChaiMcpRequest,
  runWithChaiMcpToolContext,
} from "./request-context";

export { canInvokeChaiMcpTool, getMissingChaiMcpToolPermissions } from "./permissions";
export { createChaiMcpResponse, toSafeChaiMcpError } from "./response";
export { runChaiMcpAction } from "./actions";
export { renderChaiMcpInstructions } from "./instructions";
export { summarizeChaiMcpToolArgs } from "./audit";

export type {
  ChaiMcpAuthFailureEvent,
  ChaiMcpAuthFailureReason,
  ChaiMcpInputShape,
  ChaiMcpInstructionsContext,
  ChaiMcpInstructionsSection,
  ChaiMcpPageContext,
  ChaiMcpRequestContext,
  ChaiMcpTool,
  ChaiMcpToolAnnotations,
  ChaiMcpToolCallEvent,
  ChaiMcpToolContext,
  ChaiMcpToolHandler,
  ChaiMcpToolKind,
  ChaiMcpToolMeta,
  ChaiMcpToolOutcome,
  ChaiMcpToolResult,
} from "~/types/mcp";
