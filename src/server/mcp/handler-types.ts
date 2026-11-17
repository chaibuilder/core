/**
 * Option types of the MCP transport (`createChaiMcpRouteHandlers`, `handleChaiMcpRequest`).
 *
 * Kept apart from `./handle-request` — the only module that imports the optional
 * `@modelcontextprotocol/sdk` peer — so `<pkg>/nextjs/server` can export these types without its
 * type graph reaching the SDK.
 */
import type { ChaiIncomingRequest } from "~/types/chaibuilder-config";
import type { ChaiBuilderInstance } from "~/types/chaibuilder-instance";
import type {
  ChaiMcpAuthFailureEvent,
  ChaiMcpRequestContext,
  ChaiMcpToolCallEvent,
  ChaiMcpToolMeta,
} from "~/types/mcp";

export type ChaiMcpServerInfo = {
  name: string;
  version: string;
  title?: string;
};

export type ChaiMcpHandlerOptions = {
  serverInfo: ChaiMcpServerInfo;
  /**
   * `resource_metadata` for the 401 challenge (RFC 9728), so an OAuth-capable client can
   * discover where to authenticate instead of giving up.
   */
  resourceMetadataUrl?: string | ((request: Request) => string | undefined);
  /** `realm` for the 401 challenge. Defaults to the request's own URL. */
  realm?: string;
  /**
   * Permission(s) required to use the MCP surface at all, checked before any tool is
   * listed. A credential that should not drive an agent can be refused in one place
   * rather than per tool.
   */
  connectPermission?: string | string[];
  /**
   * Ceiling for this transport, intersected with whatever the context resolver set. An
   * app can mount a read-only MCP route without changing how its credentials are issued.
   */
  delegatedPermissions?: string[];
  /** Largest `arguments` payload accepted for a single call. Default 2 MB. */
  maxArgsBytes?: number;
  /** Largest request body accepted. Default 4 MB. */
  maxBodyBytes?: number;
  /**
   * Omit tools the caller lacks permission for from `tools/list`. On by default: an agent
   * that cannot see a tool does not spend context on it or plan around it. Calls are
   * re-checked regardless, so this is a context optimisation, never the security boundary.
   */
  hideUngrantedTools?: boolean;
  /** Last word on which tools this request may see, after the permission filter. */
  toolFilter?: (tool: ChaiMcpToolMeta, ctx: ChaiMcpRequestContext) => boolean;
  /** Replace or wrap the rendered server instructions. */
  instructions?: string | ((rendered: string, ctx: ChaiMcpRequestContext) => string);
  /** Audit sink. Receives every settled tool call; a failure in it never fails the call. */
  onToolCall?: (event: ChaiMcpToolCallEvent) => void | Promise<void>;
  onAuthFailure?: (event: ChaiMcpAuthFailureEvent) => void | Promise<void>;
  /** Passed to cache invalidation for layout-level revalidation. */
  catchAllRoute?: string[];
  /** Host extras carried onto every tool context and audit event (token label, …). */
  extra?: Record<string, unknown> | ((request: Request) => Record<string, unknown>);
};

export type ChaiMcpRouteHandlerOptions = ChaiMcpHandlerOptions & {
  /** Usually `(request) => getChaiBuilder({}, request)` — the host's own resolver. */
  getChaiBuilder: (request: ChaiIncomingRequest) => Promise<ChaiBuilderInstance<any>> | ChaiBuilderInstance<any>;
};
