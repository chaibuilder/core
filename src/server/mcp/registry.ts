import type {
  ChaiMcpInputShape,
  ChaiMcpInstructionsSection,
  ChaiMcpTool,
  ChaiMcpToolHandler,
  ChaiMcpToolMeta,
} from "~/types/mcp";

/**
 * Process-global registry of MCP tools and instruction sections.
 *
 * Registration is keyed by owner ("chai:mcp", an app name, a plugin id), so re-running a
 * plugin reducer or a module reload replaces that owner's contribution rather than
 * duplicating it. Ordering is stable and explainable: owners in first-registration order,
 * tools in the order the owner listed them.
 *
 * State lives on `globalThis` for the same reason `action-hooks.ts` does: the CJS build
 * has no shared chunks, so each entry point inlines its own copy of this module. A
 * module-level Map would make tools registered through `<pkg>/plugins/mcp/server`
 * invisible to the transport in `<pkg>/mcp`.
 */

const TOOLS_KEY = Symbol.for("chaibuilder.mcp.tools");
const OVERRIDES_KEY = Symbol.for("chaibuilder.mcp.toolOverrides");
const INSTRUCTIONS_KEY = Symbol.for("chaibuilder.mcp.instructions");

type ToolsRegistry = Map<string, ChaiMcpTool[]>;
/** Tool names each owner claimed with `{ override: true }`. */
type OverridesRegistry = Map<string, Set<string>>;
type InstructionsRegistry = Map<string, ChaiMcpInstructionsSection[]>;

const _g = globalThis as typeof globalThis & {
  [TOOLS_KEY]?: ToolsRegistry;
  [OVERRIDES_KEY]?: OverridesRegistry;
  [INSTRUCTIONS_KEY]?: InstructionsRegistry;
};

function toolsRegistry(): ToolsRegistry {
  if (!_g[TOOLS_KEY]) _g[TOOLS_KEY] = new Map();
  return _g[TOOLS_KEY];
}

function overridesRegistry(): OverridesRegistry {
  if (!_g[OVERRIDES_KEY]) _g[OVERRIDES_KEY] = new Map();
  return _g[OVERRIDES_KEY];
}

function instructionsRegistry(): InstructionsRegistry {
  if (!_g[INSTRUCTIONS_KEY]) _g[INSTRUCTIONS_KEY] = new Map();
  return _g[INSTRUCTIONS_KEY];
}

/** MCP tool names are matched literally by clients; keep them boring and stable. */
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Identity helper that pins the literal `name` and the input shape, so a registry built
 * from these metas keeps a union of literal tool names for exhaustive handler maps.
 */
export function defineChaiMcpToolMeta<
  TName extends string,
  TInput extends ChaiMcpInputShape,
  TMeta = Record<string, unknown>,
>(meta: ChaiMcpToolMeta<TName, TInput, TMeta>): ChaiMcpToolMeta<TName, TInput, TMeta> {
  return meta;
}

export function defineChaiMcpTool<
  TName extends string,
  TInput extends ChaiMcpInputShape,
  TMeta = Record<string, unknown>,
>(meta: ChaiMcpToolMeta<TName, TInput, TMeta>, handler: ChaiMcpToolHandler): ChaiMcpTool<TName, TInput, TMeta> {
  return { ...meta, handler };
}

export function defineChaiMcpInstructionsSection(section: ChaiMcpInstructionsSection): ChaiMcpInstructionsSection {
  return section;
}

export type ChaiMcpRegisterOptions = {
  /**
   * Allow replacing a tool another owner already registered. Off by default: a plugin
   * silently shadowing `publish_page` with a weaker permission set is exactly the failure
   * this refuses to make quiet.
   */
  override?: boolean;
};

function validateTool(tool: ChaiMcpTool, owner: string): void {
  if (!TOOL_NAME_PATTERN.test(tool.name)) {
    throw new Error(
      `ChaiBuilder MCP: "${owner}" registered an invalid tool name "${tool.name}" (expected lowercase letters, digits and underscores).`,
    );
  }
  if (!Array.isArray(tool.permissions)) {
    throw new Error(
      `ChaiBuilder MCP: tool "${tool.name}" (${owner}) must declare a permissions array. Use [] for "any authenticated caller".`,
    );
  }
  if (typeof tool.handler !== "function") {
    throw new Error(`ChaiBuilder MCP: tool "${tool.name}" (${owner}) has no handler.`);
  }
}

/** Registers `tools` as `owner`'s whole list, claiming exactly the names in `claimed`. */
function registerTools(owner: string, tools: ChaiMcpTool[], claimed: Set<string>): void {
  const registry = toolsRegistry();
  const seen = new Set<string>();

  for (const tool of tools) {
    validateTool(tool, owner);
    if (seen.has(tool.name)) {
      throw new Error(`ChaiBuilder MCP: "${owner}" registered the tool "${tool.name}" twice.`);
    }
    seen.add(tool.name);

    if (claimed.has(tool.name)) continue;
    for (const [otherOwner, otherTools] of registry) {
      if (otherOwner === owner) continue;
      if (!otherTools.some((other) => other.name === tool.name)) continue;
      // The other owner took this name deliberately, and re-registering the
      // original over it is routine — every setup-hook run re-registers a whole
      // list — so it loses the name in `getRegisteredChaiMcpTools` rather than throwing.
      if (overridesRegistry().get(otherOwner)?.has(tool.name)) continue;
      throw new Error(
        `ChaiBuilder MCP: "${owner}" registered the tool "${tool.name}", already owned by "${otherOwner}". Pass { override: true } to replace it deliberately.`,
      );
    }
  }

  registry.set(owner, [...tools]);
  // The claim is remembered per owner rather than inferred from registration
  // order: `getRegisteredChaiMcpTools` would otherwise hand the name to whichever owner
  // sits later in the Map, which is the order owners FIRST registered in — so an
  // app whose setup hook ran before this plugin's would silently lose the name
  // it asked to override. A claim on a name no longer in the list is dropped.
  const kept = new Set([...claimed].filter((name) => seen.has(name)));
  if (kept.size > 0) overridesRegistry().set(owner, kept);
  else overridesRegistry().delete(owner);
}

export function registerChaiMcpTools(owner: string, tools: ChaiMcpTool[], options: ChaiMcpRegisterOptions = {}): void {
  // A whole-list registration restates what this owner claims: without
  // `override` it claims nothing, which is how a claim is given back.
  registerTools(owner, tools, options.override ? new Set(tools.map((tool) => tool.name)) : new Set());
}

export function registerChaiMcpTool(owner: string, tool: ChaiMcpTool, options: ChaiMcpRegisterOptions = {}): void {
  const existing = toolsRegistry().get(owner) ?? [];
  const next = existing.filter((other) => other.name !== tool.name);
  next.push(tool);
  // Adding one tool is not a retraction of the names this owner already claimed
  // with `{ override: true }`. Forwarding a bare `options` would drop them — and
  // trip the conflict check above on the very names it had been granted.
  const claimed = new Set(overridesRegistry().get(owner) ?? []);
  if (options.override) claimed.add(tool.name);
  registerTools(owner, next, claimed);
}

export function unregisterChaiMcpTools(owner: string): void {
  toolsRegistry().delete(owner);
  overridesRegistry().delete(owner);
}

/** Removes one tool an owner registered, and the override claim it held on that name. */
export function unregisterChaiMcpTool(owner: string, name: string): void {
  const remaining = (toolsRegistry().get(owner) ?? []).filter((tool) => tool.name !== name);
  const claimed = new Set(overridesRegistry().get(owner) ?? []);
  claimed.delete(name);
  if (remaining.length === 0) {
    unregisterChaiMcpTools(owner);
    return;
  }
  registerTools(owner, remaining, claimed);
}

/**
 * Every registered tool, in list order. An owner that registered a name with
 * `override` wins it, whichever of the owners registered first; the shadowed
 * tool is dropped rather than listed twice.
 */
export function getRegisteredChaiMcpTools(): ChaiMcpTool[] {
  const overrides = overridesRegistry();
  const byName = new Map<string, ChaiMcpTool>();
  const claimed = new Set<string>();
  for (const [owner, tools] of toolsRegistry()) {
    const owned = overrides.get(owner);
    for (const tool of tools) {
      const isOverride = Boolean(owned?.has(tool.name));
      if (claimed.has(tool.name) && !isOverride) continue;
      byName.set(tool.name, tool);
      if (isOverride) claimed.add(tool.name);
    }
  }
  return [...byName.values()];
}

export function getRegisteredChaiMcpTool(name: string): ChaiMcpTool | undefined {
  return getRegisteredChaiMcpTools().find((tool) => tool.name === name);
}

export function registerChaiMcpInstructions(
  owner: string,
  sections: ChaiMcpInstructionsSection[],
  options: ChaiMcpRegisterOptions = {},
): void {
  const registry = instructionsRegistry();
  const seen = new Set<string>();

  for (const section of sections) {
    if (!section.id) {
      throw new Error(`ChaiBuilder MCP: "${owner}" registered an instruction section without an id.`);
    }
    if (seen.has(section.id)) {
      throw new Error(`ChaiBuilder MCP: "${owner}" registered the instruction section "${section.id}" twice.`);
    }
    seen.add(section.id);

    if (options.override) continue;
    for (const [otherOwner, otherSections] of registry) {
      if (otherOwner === owner) continue;
      if (otherSections.some((other) => other.id === section.id)) {
        throw new Error(
          `ChaiBuilder MCP: "${owner}" registered the instruction section "${section.id}", already owned by "${otherOwner}". Pass { override: true } to replace it deliberately.`,
        );
      }
    }
  }

  registry.set(owner, [...sections]);
}

export function unregisterChaiMcpInstructions(owner: string): void {
  instructionsRegistry().delete(owner);
}

/** Registered sections, sorted by `order` then by id so the render is deterministic. */
export function getRegisteredChaiMcpInstructions(): ChaiMcpInstructionsSection[] {
  const byId = new Map<string, ChaiMcpInstructionsSection>();
  for (const sections of instructionsRegistry().values()) {
    for (const section of sections) byId.set(section.id, section);
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** @internal Clears the registry between unit tests. */
export function resetChaiMcpRegistryForTests(): void {
  _g[TOOLS_KEY] = undefined;
  _g[OVERRIDES_KEY] = undefined;
  _g[INSTRUCTIONS_KEY] = undefined;
}
