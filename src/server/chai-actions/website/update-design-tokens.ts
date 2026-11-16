import { z } from "zod";
import { getAppFields, updateAppFields } from "~/server/chai-actions/apps/app-store";
import type { ChaiDesignTokens } from "~/types/types";
import { ActionError } from "../action-error";
import { formatZodIssues } from "../ai/design-system-schema";
import { ChaiBaseAction } from "../base-action";
import { runChaiActionHooks } from "~/server/plugin-api/action-hooks";
import { serializeByKey } from "../utils/serialize-by-key";
import {
  applyDesignTokenUpdates,
  designTokenUpdatesSchema,
  type DesignTokenUpdate,
  type DesignTokenUpdateResult,
} from "./design-token-updates";

type UpdateDesignTokensActionData = { tokens: DesignTokenUpdate[] };
type UpdateDesignTokensActionResponse = {
  success: true;
  designTokens: ChaiDesignTokens;
  updated: DesignTokenUpdateResult[];
};

/**
 * Restyle the site's existing design tokens (built-in or its own). Never creates one — see
 * `applyDesignTokenUpdates`. Marks the tokens as changed; `PUBLISH_CHANGES` with
 * `"DESIGN_TOKENS"` takes them live.
 */
export class UpdateDesignTokensAction extends ChaiBaseAction<
  UpdateDesignTokensActionData,
  UpdateDesignTokensActionResponse
> {
  protected getValidationSchema() {
    return z.object({ tokens: z.any() });
  }

  async execute(data: UpdateDesignTokensActionData): Promise<UpdateDesignTokensActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
    const parsed = designTokenUpdatesSchema.safeParse(data.tokens);
    if (!parsed.success) {
      throw new ActionError(`Invalid tokens: ${formatZodIssues(parsed.error)}`, "INVALID_DATA", 400);
    }

    const { appId } = this.context;
    // Read, merge and write as one step per app, so parallel edits do not drop each other.
    return serializeByKey(`apps:${appId}`, async () => {
      const { data: app, error: readError } = await getAppFields(appId, ["designTokens", "changes"]);
      if (readError) {
        throw new ActionError("Error reading design tokens", "ERROR_UPDATE_DESIGN_TOKENS", 500, readError);
      }
      if (!app) {
        throw new ActionError("Site not found", "NOT_FOUND", 404);
      }

      const { next, updated } = applyDesignTokenUpdates((app.designTokens as ChaiDesignTokens) ?? {}, parsed.data);
      const changes = [...new Set([...((app.changes as string[] | null) ?? []), "DESIGN_TOKENS"])];
      const { error } = await updateAppFields(appId, { designTokens: next, changes });
      if (error) {
        throw new ActionError("Error updating design tokens", "ERROR_UPDATE_DESIGN_TOKENS", 500, error);
      }
      // Same history as builder saves, so an AI/MCP restyle can be rolled back.
      await runChaiActionHooks("theme:saved", {
        appId,
        userId: this.context?.userId,
        snapshot: { designTokens: next },
      });
      return { success: true as const, designTokens: next, updated };
    });
  }
}
