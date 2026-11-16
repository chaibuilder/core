import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import type { ChaiMcpInstructionsContext, ChaiMcpToolMeta } from "~/types/mcp";
import { getChaiMcpInstructionsSections, getChaiMcpTools } from "./registry";

/** `\b` treats `_` as a word character, so `page_edit` does not match `start_page_edit`. */
const mentions = (text: string, name: string): boolean => new RegExp(`\\b${name}\\b`).test(text);

/**
 * Drop the bullets of a section that talk only about tools this caller cannot see.
 *
 * Section bodies are mostly per-tool bullet lists, and a static one names every tool the
 * installation registered — not every tool this credential was granted. Telling an agent
 * to call something absent from `tools/list` costs it a turn and a failed call, so a
 * bullet whose tool names are all hidden is removed. A bullet naming a visible tool is
 * kept whole, even where it also mentions a hidden one for contrast; and a bullet naming
 * no tool at all is guidance about the domain, so it stays.
 */
function dropHiddenToolLines(body: string, registered: string[], visible: Set<string>): string {
  if (registered.length === 0) return body;
  const kept = body.split("\n").filter((line) => {
    if (!line.trimStart().startsWith("- ")) return true;
    const named = registered.filter((name) => mentions(line, name));
    return named.length === 0 || named.some((name) => visible.has(name));
  });
  return kept.join("\n");
}

/**
 * Server instructions handed to the client on `initialize` — the one place to teach an
 * agent the workflow rules a tool description is too small to hold (lock a page before
 * editing it, read the outline before picking a block id, publish only when asked).
 *
 * Rendered per request against the tools that caller can actually see. Setup-time gating
 * can only answer whether a tool is installed; permissions are per credential, so the
 * visibility filter has to run here — by section (`requiresTools`) and then by bullet.
 * Derived sections (the publish gate) read `ctx.tools` themselves and stay in step with
 * the registry instead of being hand-maintained.
 */
export function renderChaiMcpInstructions(tools: ChaiMcpToolMeta[]): string {
  const ctx: ChaiMcpInstructionsContext = { tools, config: getActiveChaiBuilderConfig() };
  const visible = new Set(tools.map((tool) => tool.name));
  // Every registered name, not just the visible ones: a name is only worth filtering a
  // line for if it is a tool somewhere, and the hidden ones are exactly the point.
  const registered = getChaiMcpTools().map((tool) => tool.name);

  const rendered: string[] = [];
  for (const section of getChaiMcpInstructionsSections()) {
    if (section.requiresTools && !section.requiresTools.some((name) => visible.has(name))) continue;

    let body: string;
    try {
      body = typeof section.body === "function" ? section.body(ctx) : section.body;
    } catch (error) {
      // A broken section must not take the whole connection down with it.
      console.error(`[chai-mcp] instruction section "${section.id}" failed to render:`, error);
      continue;
    }
    const trimmed = dropHiddenToolLines(body ?? "", registered, visible).trim();
    if (!trimmed) continue;
    rendered.push(section.title ? `# ${section.title}\n\n${trimmed}` : trimmed);
  }

  return rendered.join("\n\n");
}
