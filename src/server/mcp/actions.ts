import { runChaiAction } from "~/server/chai-actions/dispatch-action";
import { applyChaiActionCacheEffects, type ChaiActionCacheOptions } from "~/server/chai-builder/action-cache-effects";

/**
 * Dispatch a ChaiBuilder action from an MCP tool and apply its cache effects.
 *
 * Mutating actions report what they touched as `tags`/`paths` and leave the invalidation
 * to their transport. The builder's HTTP route does it; MCP tools dispatch actions
 * directly, so without this a publish through a tool would leave the live URL serving its
 * previous cached render.
 *
 * Invalidation never fails the call: the write already happened, and reporting it as an
 * error would make an agent retry a mutation that succeeded.
 */
export async function runChaiMcpAction<TResult = unknown>(
  name: string,
  input: unknown,
  options: ChaiActionCacheOptions = {},
): Promise<TResult> {
  const result = (await runChaiAction(name, input)) as TResult;
  try {
    await applyChaiActionCacheEffects(name, result, options);
  } catch (error) {
    console.error(`[chai-mcp] cache invalidation failed after ${name}:`, error);
  }
  return result;
}
