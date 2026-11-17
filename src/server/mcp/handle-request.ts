import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getParseErrorMessage, objectFromShape, safeParseAsync } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runInFreshContext } from "~/server/chai-builder/state";
import { mergeDelegationCeilings, resolveEffectivePermissions } from "~/server/rbac/effective-permissions";
import type { ChaiIncomingRequest, ChaiRequestContext } from "~/types/chaibuilder-config";
import type { ChaiBuilderInstance } from "~/types/chaibuilder-instance";
import type { ChaiMcpRequestContext, ChaiMcpTool, ChaiMcpToolOutcome, ChaiMcpToolResult } from "~/types/mcp";
import { summarizeChaiMcpToolArgs } from "./audit";
import { renderChaiMcpInstructions } from "./instructions";
import { canInvokeChaiMcpTool, getMissingChaiMcpToolPermissions } from "./permissions";
import { getRegisteredChaiMcpTools } from "./registry";
import { runWithChaiMcpRequest, runWithChaiMcpToolContext } from "./request-context";
import { toSafeChaiMcpError } from "./response";
import type { ChaiMcpHandlerOptions, ChaiMcpRouteHandlerOptions } from "./handler-types";

export type { ChaiMcpHandlerOptions, ChaiMcpRouteHandlerOptions, ChaiMcpServerInfo } from "./handler-types";

/**
 * MCP Streamable HTTP transport for ChaiBuilder.
 *
 * The only module in the package that imports `@modelcontextprotocol/sdk`, and the reason
 * the `<pkg>/mcp` entry point exists: the SDK is an optional peer, and an app that never
 * mounts an MCP route must never resolve it. The import is static, not hidden behind a
 * runtime `import()`, so Next's file tracing still copies the package into the build of
 * the apps that *do* use it (see `~/ai/openrouter` for the same trade-off).
 *
 * Stateless by design — `sessionIdGenerator: undefined`. A serverless deployment has no
 * sticky process to hold a session in, and every tool call carries everything it needs
 * anyway. The cost is a fresh `Server` + transport per request: both refuse reuse
 * (`protocol.connect` throws on a second connect, the transport throws when a stateless
 * instance handles a second request), which is also what keeps one caller's context from
 * leaking into another's.
 */

const DEFAULT_MAX_ARGS_BYTES = 2_000_000;
const DEFAULT_MAX_BODY_BYTES = 4_000_000;

/** JSON Schema is derived once per tool object, not once per request. */
const jsonSchemaCache = new WeakMap<ChaiMcpTool, Record<string, unknown>>();

function toolJsonSchema(tool: ChaiMcpTool): Record<string, unknown> {
  const cached = jsonSchemaCache.get(tool);
  if (cached) return cached;
  const schema = toJsonSchemaCompat(objectFromShape(tool.inputSchema), { strictUnions: true });
  jsonSchemaCache.set(tool, schema);
  return schema;
}

/**
 * A cookie-less view of the request for the context resolver.
 *
 * An MCP client authenticates with a header. Letting the resolver fall back to the
 * browser session cookie would turn this route into a confused deputy: any page the user
 * has open could POST tool calls here and act with their full builder permissions. The
 * restriction is structural rather than a rule each resolver has to remember.
 */
export function toChaiMcpIncomingRequest(request: Request): ChaiIncomingRequest {
  return {
    headers: request.headers,
    method: request.method,
    url: request.url,
    cookies: { get: () => undefined },
  };
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "Method not allowed. MCP requests use POST." }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST" },
  });
}

function unauthorized(request: Request, options: ChaiMcpHandlerOptions): Response {
  const realm = options.realm ?? new URL(request.url).origin;
  const resourceMetadata =
    typeof options.resourceMetadataUrl === "function"
      ? options.resourceMetadataUrl(request)
      : options.resourceMetadataUrl;

  const challenge = [`Bearer realm="${realm}"`, resourceMetadata ? `resource_metadata="${resourceMetadata}"` : null]
    .filter(Boolean)
    .join(", ");

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": challenge },
  });
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

async function notify(fn: (() => void | Promise<void>) | undefined, label: string): Promise<void> {
  if (!fn) return;
  try {
    await fn();
  } catch (error) {
    console.error(`[chai-mcp] ${label} hook failed:`, error);
  }
}

/**
 * The body as text, or null once it passes `maxBytes`.
 *
 * Read in chunks and abandoned the moment the cap is crossed, rather than through
 * `request.text()`: this runs *before* the credential check, so buffering the whole
 * body first would let an unauthenticated caller push an arbitrarily large payload
 * into memory only to be answered with a 413. Counted in bytes — `String.length`
 * counts UTF-16 code units, so a multi-byte body can be several times the limit and
 * still pass.
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  const stream = request.body;
  if (!stream) {
    const text = await request.text();
    return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      // Abandon the transfer rather than draining a body that may not end.
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Reads the body once: the size guard and the `initialize` check both need it. */
async function readBody(request: Request, maxBytes: number): Promise<{ body?: unknown; tooLarge?: boolean }> {
  // Refuse on the declared length before a byte is read, when the client sent one.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true };

  const text = await readCappedText(request, maxBytes);
  if (text === null) return { tooLarge: true };
  if (!text) return { body: undefined };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { body: undefined };
  }
}

function isInitializeRequest(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => (message as { method?: string })?.method === "initialize");
}

export async function handleChaiMcpRequest(
  cb: ChaiBuilderInstance<any>,
  request: Request,
  options: ChaiMcpHandlerOptions,
): Promise<Response> {
  // A standalone GET stream has nothing to carry in stateless mode, and DELETE closes a
  // session that was never opened. Answering them here keeps the transport from holding
  // a request open forever.
  if (request.method !== "POST") return methodNotAllowed();

  const { body, tooLarge } = await readBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  if (tooLarge) {
    return new Response(JSON.stringify({ error: "Request body too large." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  const resolved = cb.context;

  // No credential at all is the probe every OAuth-capable client makes before it
  // authenticates, so it is answered with the challenge rather than treated as an error.
  if (!request.headers.get("authorization") || !resolved.userId || resolved.permissions == null) {
    await notify(
      () => options.onAuthFailure?.({ reason: "unauthenticated", request, userId: resolved.userId ?? null }),
      "onAuthFailure",
    );
    return unauthorized(request, options);
  }

  const ceiling = mergeDelegationCeilings(
    resolved.delegatedPermissions ?? resolved.delegatedScopes ?? null,
    options.delegatedPermissions ?? null,
  );
  const permissions = resolveEffectivePermissions(resolved.permissions, ceiling);

  const connectPermissions = options.connectPermission
    ? Array.isArray(options.connectPermission)
      ? options.connectPermission
      : [options.connectPermission]
    : [];
  const missingConnect = getMissingChaiMcpToolPermissions(permissions, {
    name: "connect",
    kind: "read",
    description: "",
    inputSchema: {},
    permissions: connectPermissions,
  });
  if (missingConnect.length > 0) {
    await notify(
      () =>
        options.onAuthFailure?.({
          reason: "forbidden",
          request,
          userId: resolved.userId,
          appId: resolved.appId,
          missingPermission: missingConnect[0],
        }),
      "onAuthFailure",
    );
    return forbidden(`This credential may not use the MCP surface (missing ${missingConnect.join(", ")}).`);
  }

  const extra = (typeof options.extra === "function" ? options.extra(request) : options.extra) ?? {};

  const mcpContext: ChaiMcpRequestContext = {
    cb,
    request,
    appId: resolved.appId,
    userId: resolved.userId,
    permissions,
    surface: resolved.surface ?? "mcp",
    extra,
  };

  // The derived context — surface stamped, ceiling applied — must not collapse into an
  // outer request state that lacks them, so it starts a store of its own. Every `cb.*`
  // call and every action dispatched from a tool then sees the MCP identity, which is
  // what makes revisions attribute to `mcp` and the ceiling bind in `runChaiAction`.
  const derived: ChaiRequestContext = {
    ...resolved,
    surface: mcpContext.surface,
    delegatedPermissions: ceiling,
    // Agents work on drafts: they read a page, edit it, and publish it as a separate,
    // explicitly approved step. Draft mode is normally turned on by the preview cookie,
    // which an MCP client has no way to set, so without this every unpublished page reads
    // as missing and every edit is made against stale published content.
    draft: true,
  };

  return runInFreshContext(derived, () =>
    runWithChaiMcpRequest(mcpContext, () => serve(request, body, mcpContext, options)),
  );
}

function visibleTools(ctx: ChaiMcpRequestContext, options: ChaiMcpHandlerOptions): ChaiMcpTool[] {
  const hide = options.hideUngrantedTools ?? true;
  return getRegisteredChaiMcpTools().filter((tool) => {
    if (hide && !canInvokeChaiMcpTool(ctx.permissions, tool)) return false;
    return options.toolFilter ? options.toolFilter(tool, ctx) : true;
  });
}

async function serve(
  request: Request,
  body: unknown,
  ctx: ChaiMcpRequestContext,
  options: ChaiMcpHandlerOptions,
): Promise<Response> {
  // Instructions cost real context, and only `initialize` returns them.
  let instructions: string | undefined;
  if (isInitializeRequest(body)) {
    const rendered = renderChaiMcpInstructions(visibleTools(ctx, options));
    instructions =
      typeof options.instructions === "function"
        ? options.instructions(rendered, ctx)
        : (options.instructions ?? rendered);
  }

  const server = new Server(options.serverInfo, {
    capabilities: { tools: {} },
    ...(instructions ? { instructions } : {}),
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools(ctx, options).map((tool) => ({
      name: tool.name,
      ...(tool.title ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: toolJsonSchema(tool),
      annotations: {
        readOnlyHint: tool.kind === "read",
        ...tool.annotations,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, (callRequest) =>
    callTool(callRequest.params.name, (callRequest.params.arguments ?? {}) as Record<string, unknown>, ctx, options),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    // Closes the transport too. Without it a stateless request leaks a connected server.
    await server.close().catch(() => {});
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ChaiMcpRequestContext,
  options: ChaiMcpHandlerOptions,
): Promise<ChaiMcpToolResult> {
  return runWithChaiMcpToolContext(name, async (toolCtx) => {
    const startedAt = Date.now();
    let outcome: ChaiMcpToolOutcome = "ok";
    let message: string | undefined;
    let thrown: unknown;

    // Awaited, like every other `notify` call: the hook is the only place a 5xx's real
    // error goes, and a sink that writes somewhere (a table, a log shipper) would still
    // be in flight when the response is flushed — on a serverless host the invocation is
    // frozen there and the record is lost. A failure in it still never fails the call.
    const finish = async (result: ChaiMcpToolResult): Promise<ChaiMcpToolResult> => {
      await notify(
        () =>
          options.onToolCall?.({
            toolName: name,
            outcome,
            durationMs: Date.now() - startedAt,
            appId: ctx.appId,
            userId: ctx.userId,
            args: summarizeChaiMcpToolArgs(args),
            page: toolCtx.page,
            detail: toolCtx.detail,
            ...(message ? { message } : {}),
            // An escaped exception first; otherwise whatever a handler caught and
            // recorded on its way to returning a safe message. Either way the audit sink
            // sees the real failure the caller was not given.
            ...(thrown !== undefined ? { error: thrown } : toolCtx.error !== undefined ? { error: toolCtx.error } : {}),
            extra: ctx.extra,
          }),
        "onToolCall",
      );
      return result;
    };

    const fail = (reason: ChaiMcpToolOutcome, text: string): Promise<ChaiMcpToolResult> => {
      outcome = reason;
      message = text;
      return finish({ content: [{ type: "text", text }], isError: true });
    };

    // Guard the payload before anything touches it: a tool that takes page HTML is an
    // easy way to push an unbounded string through parsing and into the database.
    // Bytes, not `.length`: a string's length counts UTF-16 code units, so a payload of
    // CJK or emoji would pass a byte cap it is two or three times over.
    const argsBytes = Buffer.byteLength(JSON.stringify(args), "utf8");
    const maxArgsBytes = options.maxArgsBytes ?? DEFAULT_MAX_ARGS_BYTES;
    if (argsBytes > maxArgsBytes) {
      return fail("invalid", `Error: arguments are too large (${argsBytes} bytes, limit ${maxArgsBytes}).`);
    }

    // Looked up from the same filtered list the client was shown, so a tool hidden by
    // `toolFilter` reads as absent rather than as a permission failure.
    const tool = visibleTools(ctx, options).find((candidate) => candidate.name === name);
    if (!tool) {
      // Distinguish "never existed" from "you cannot see it" for the audit trail only;
      // the caller is told the same thing either way.
      outcome = getRegisteredChaiMcpTools().some((candidate) => candidate.name === name) ? "forbidden" : "not_found";
      message = `Error: unknown tool "${name}".`;
      return finish({ content: [{ type: "text", text: message }], isError: true });
    }

    // Re-checked even though the list was filtered: `hideUngrantedTools` is a context
    // optimisation, and this is the boundary.
    const missing = getMissingChaiMcpToolPermissions(ctx.permissions, tool);
    if (missing.length > 0) {
      return fail("forbidden", `Error: missing permission ${missing.join(", ")} for "${name}".`);
    }

    const parsed = await safeParseAsync(objectFromShape(tool.inputSchema), args);
    if (!parsed.success) {
      return fail("invalid", `Error: invalid arguments for "${name}": ${getParseErrorMessage(parsed.error)}`);
    }

    try {
      const result = await tool.handler(parsed.data as Record<string, unknown>, toolCtx);
      if (result.isError) {
        outcome = "error";
        message = result.content.map((part) => part.text).join("\n");
      }
      return finish(result);
    } catch (error) {
      outcome = "error";
      thrown = error;
      const text = toSafeChaiMcpError(error);
      message = text;
      return finish({ content: [{ type: "text", text }], isError: true });
    }
  });
}

/**
 * Route handlers for a framework that exports `GET`/`POST`/`DELETE` (Next.js App Router,
 * Hono, Remix). One line in the host; everything below it lives here.
 */
export function createChaiMcpRouteHandlers(options: ChaiMcpRouteHandlerOptions): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
} {
  const { getChaiBuilder, ...handlerOptions } = options;

  const handle = async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return methodNotAllowed();
    const cb = await getChaiBuilder(toChaiMcpIncomingRequest(request));
    return handleChaiMcpRequest(cb, request, handlerOptions);
  };

  return { GET: handle, POST: handle, DELETE: handle };
}
