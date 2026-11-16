/**
 * `<pkg>/mcp` — the MCP transport entry point.
 *
 * Separate from `<pkg>/nextjs/server` because it statically imports
 * `@modelcontextprotocol/sdk`, an optional peer: importing this module without the
 * package installed is a build error, which is the point. Apps that only *define* tools
 * import from `<pkg>/nextjs/server` and never resolve the SDK.
 */

export * from "./api";
export {
  createChaiMcpRouteHandlers,
  handleChaiMcpRequest,
  toChaiMcpIncomingRequest,
  type ChaiMcpHandlerOptions,
  type ChaiMcpRouteHandlerOptions,
  type ChaiMcpServerInfo,
} from "./handle-request";
