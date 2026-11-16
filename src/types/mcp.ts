import type { ChaiActionSurface } from "~/types/chai-action";
import type { ChaiBuilderInstance } from "~/types/chaibuilder-instance";
import type { ResolvedChaiBuilderServerConfig } from "~/types/server-config";

/**
 * Public types for the MCP (Model Context Protocol) surface.
 *
 * Deliberately free of any `@modelcontextprotocol/sdk` and `zod` types: the SDK is an
 * optional peer resolved only by `~/server/mcp/handle-request`, and the zod instance a
 * tool's schema is built with belongs to whoever defined the tool (an app on zod 3 and
 * the SDK on zod 4 resolve different copies). A tool definition therefore has to be
 * describable — and type-checkable — without either.
 */

/**
 * A zod *raw shape*: a plain object of zod fields (`{ url: z.string() }`), not `z.object({...})`.
 * The transport converts it to JSON Schema and parses call arguments with it.
 */
export type ChaiMcpInputShape = Record<string, any>;

/**
 * What a tool does to site content. Drives the client-facing read-only hint and the
 * instruction sections that are derived from the registry (e.g. the publish gate, which
 * has to name every tool that writes a draft without publishing it).
 */
export type ChaiMcpToolKind = "read" | "write" | "publish";

export type ChaiMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ChaiMcpToolAnnotations = {
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ChaiMcpToolMeta<
  TName extends string = string,
  TInput extends ChaiMcpInputShape = ChaiMcpInputShape,
  TMeta = Record<string, unknown>,
> = {
  /** Unique across every owner. Lowercase, digits and underscores (`create_page`). */
  name: TName;
  /** Short human label for clients that show one. Optional; the name is the fallback. */
  title?: string;
  description: string;
  inputSchema: TInput;
  /**
   * Permissions the caller must hold **all** of. Required, and fail-closed by
   * construction: a tool that is not in the registry, or whose permissions the caller
   * lacks, is never listed and never callable. `[]` means any authenticated caller.
   */
  permissions: string[];
  kind: ChaiMcpToolKind;
  /** A `write` that changes the live page the instant it returns, not the draft. */
  livePageWrite?: boolean;
  /** A `write` that changes no page data — only an edit-session lease. */
  sessionOnly?: boolean;
  /** Action names the handler dispatches indirectly, for the permission-superset test. */
  dispatches?: string[];
  annotations?: ChaiMcpToolAnnotations;
  /** Anything the owner wants to carry alongside the tool (docs rows, feature ids, …). */
  meta?: TMeta;
};

/** Page facts a tool touched. Recorded by the shared resolver, read by the audit hook. */
export type ChaiMcpPageContext = {
  id?: string;
  primaryPageId?: string;
  name?: string;
  slug?: string;
  lang?: string;
  isLanguageVariant?: boolean;
};

export type ChaiMcpRequestContext = {
  /** Context-bound ChaiBuilder instance for this request. */
  cb: ChaiBuilderInstance<any>;
  request: Request;
  appId: string;
  userId: string;
  /** Effective permissions: the user's grants clamped by every delegation ceiling. */
  permissions: string[];
  surface: ChaiActionSurface;
  /** Host-supplied extras (token label, client info, …), passed through to the audit hook. */
  extra: Record<string, unknown>;
};

export type ChaiMcpToolContext = ChaiMcpRequestContext & {
  toolName: string;
  /** Set via `recordChaiMcpPageContext`; merged across calls within one tool call. */
  page?: ChaiMcpPageContext;
  /** Free-form audit detail for this call; `recordChaiMcpToolDetail` merges into it. */
  detail: Record<string, unknown>;
  /**
   * The real error behind a failure the handler caught and turned into a message, set by
   * `recordChaiMcpToolError`. It reaches the audit hook and never the caller — a handler
   * that catches an exception must not lose what actually went wrong.
   */
  error?: unknown;
};

export type ChaiMcpToolHandler = (args: Record<string, unknown>, ctx: ChaiMcpToolContext) => Promise<ChaiMcpToolResult>;

export type ChaiMcpTool<
  TName extends string = string,
  TInput extends ChaiMcpInputShape = ChaiMcpInputShape,
  TMeta = Record<string, unknown>,
> = ChaiMcpToolMeta<TName, TInput, TMeta> & { handler: ChaiMcpToolHandler };

/** What an instruction section body can see when it is rendered, once per request. */
export type ChaiMcpInstructionsContext = {
  /** Tools this caller can actually see — a section must not describe a hidden tool. */
  tools: ChaiMcpToolMeta[];
  config: ResolvedChaiBuilderServerConfig;
};

export type ChaiMcpInstructionsSection = {
  /** Unique across owners, e.g. `"page-workflow"`. */
  id: string;
  /**
   * Render position. Sections are sorted by `order`, not by registration order, so two
   * plugins adding sections never conflict over list position. Core/pro use 0-100.
   */
  order: number;
  /** Rendered as a heading above the body. Omit for a preamble. */
  title?: string;
  /**
   * Tool names this section's guidance is about. The section is rendered only when the
   * caller can see at least one of them, so a credential without `redirects:*` is not
   * told to call `list_redirects`. Checked per request against the caller's visible
   * tools, which subsumes the setup-time question of whether the tool exists at all.
   */
  requiresTools?: string[];
  /** A function body is evaluated per request, so it can reflect the live registry. */
  body: string | ((ctx: ChaiMcpInstructionsContext) => string);
};

export type ChaiMcpToolOutcome = "ok" | "error" | "forbidden" | "invalid" | "not_found";

/** One tool call, handed to the host's audit sink after the call settles. */
export type ChaiMcpToolCallEvent = {
  toolName: string;
  outcome: ChaiMcpToolOutcome;
  durationMs: number;
  appId: string;
  userId: string;
  /** Size-capped, secret-redacted copy of the call arguments. */
  args: Record<string, unknown>;
  page?: ChaiMcpPageContext;
  detail: Record<string, unknown>;
  /** Message shown to the caller when the outcome is not `ok`. */
  message?: string;
  /** The real error, for the host's own logs. Never sent to the caller. */
  error?: unknown;
  extra: Record<string, unknown>;
};

export type ChaiMcpAuthFailureReason = "unauthenticated" | "forbidden";

export type ChaiMcpAuthFailureEvent = {
  reason: ChaiMcpAuthFailureReason;
  request: Request;
  userId?: string | null;
  appId?: string | null;
  /** The connect permission that was missing, when `reason` is `forbidden`. */
  missingPermission?: string;
};
