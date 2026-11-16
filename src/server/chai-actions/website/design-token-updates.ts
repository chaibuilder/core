import { z } from "zod";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import type { ChaiDesignTokens } from "~/types/types";
import {
  DESIGN_TOKEN_NAME_MAX,
  DESIGN_TOKEN_NAME_RE,
  DESIGN_TOKEN_VALUE_MAX,
  isBuiltInDesignToken,
  mergeBuiltInTokenClasses,
  tokenClassesError,
} from "~/utils/design-token-overrides";
import { ActionError } from "../action-error";

/**
 * Updates to existing design tokens: validation and merge. Pure (no DB, no server guard), so
 * tool metas can reuse the schema.
 *
 * Edit-only by design: an id that is neither a built-in nor an existing site token is
 * refused, so this can restyle the site's vocabulary but never grow it. New tokens are made
 * in the builder.
 */

export const designTokenUpdateSchema = z.strictObject({
  id: z
    .string()
    .regex(/^dt#[A-Za-z0-9-]+$/, "must be an existing token id (dt#…)")
    .describe("An existing token id: a built-in such as dt#btn-primary, or one of the site's own tokens."),
  value: z
    .string()
    .max(DESIGN_TOKEN_VALUE_MAX)
    .optional()
    .describe(
      "Tailwind classes. Built-in token: merged over it (its layout, focus and disabled classes always stay). Site token: its new complete class list.",
    ),
  reset: z.boolean().optional().describe("Built-in only: drop this site's restyle first; alone, restores the default."),
  name: z.string().trim().max(DESIGN_TOKEN_NAME_MAX).optional().describe("Site tokens only: a new name."),
  description: z.string().max(200).optional().describe("Site tokens only."),
  archived: z.boolean().optional().describe("Site tokens only."),
});
export type DesignTokenUpdate = z.infer<typeof designTokenUpdateSchema>;

export const designTokenUpdatesSchema = z.array(designTokenUpdateSchema).min(1).max(40);

export type DesignTokenUpdateResult = { id: string; name: string; value: string };

export function applyDesignTokenUpdates(
  current: ChaiDesignTokens,
  updates: DesignTokenUpdate[],
): { next: ChaiDesignTokens; updated: DesignTokenUpdateResult[] } {
  const next: ChaiDesignTokens = { ...current };
  const updated: DesignTokenUpdateResult[] = [];
  const seen = new Set<string>();

  for (const update of updates) {
    const { id } = update;
    if (seen.has(id)) throw new ActionError(`${id} appears more than once`, "INVALID_DATA", 400);
    seen.add(id);

    if (update.value !== undefined) {
      const problem = tokenClassesError(update.value);
      if (problem) throw new ActionError(`${id}: value ${problem}`, "INVALID_DATA", 400);
    }

    if (isBuiltInDesignToken(id)) {
      const builtIn = CHAI_BUILT_IN_DESIGN_TOKENS[id];
      const siteOnly = (["name", "description", "archived"] as const).filter((key) => update[key] !== undefined);
      if (siteOnly.length) {
        throw new ActionError(`${id}: ${siteOnly.join(", ")} apply to site tokens only`, "INVALID_DATA", 400);
      }
      if (update.value === undefined && !update.reset) {
        throw new ActionError(`${id}: pass value (classes to apply) or reset`, "INVALID_DATA", 400);
      }
      if (update.value === undefined) {
        // Reset alone: back to the built-in as shipped.
        delete next[id];
        updated.push({ id, name: builtIn.name, value: builtIn.value });
        continue;
      }
      const stored = next[id];
      const value = mergeBuiltInTokenClasses(id, update.value, stored, { reset: update.reset });
      next[id] = { ...builtIn, ...stored, value };
      updated.push({ id, name: builtIn.name, value });
      continue;
    }

    const existing = current[id];
    if (!existing) {
      throw new ActionError(
        `${id} is not a design token of this site. Tokens can be restyled here but not created; create new tokens in the builder.`,
        "NOT_FOUND",
        404,
      );
    }
    if (update.reset) throw new ActionError(`${id}: reset applies to built-in tokens only`, "INVALID_DATA", 400);

    const name = update.name ?? existing.name;
    if (update.name !== undefined) {
      if (!DESIGN_TOKEN_NAME_RE.test(name)) {
        throw new ActionError(`${id}: name may only contain letters, digits and hyphens`, "INVALID_DATA", 400);
      }
      const taken = Object.entries({ ...CHAI_BUILT_IN_DESIGN_TOKENS, ...next }).some(
        ([otherId, token]) => otherId !== id && token?.name === name,
      );
      if (taken) throw new ActionError(`${id}: another token is already named "${name}"`, "INVALID_DATA", 400);
    }

    const token = {
      ...existing,
      name,
      ...(update.description !== undefined ? { description: update.description } : {}),
      ...(update.value !== undefined ? { value: update.value.trim() } : {}),
      ...(update.archived !== undefined ? { archived: update.archived } : {}),
    };
    next[id] = token;
    updated.push({ id, name: token.name, value: token.value });
  }

  return { next, updated };
}
