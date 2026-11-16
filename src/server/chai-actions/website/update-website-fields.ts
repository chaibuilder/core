import { pick } from "lodash-es";
import { z } from "zod";
import { getAppFields, updateAppFields } from "~/server/chai-actions/apps/app-store";
import { apiError } from "~/server/chai-actions/lib";
import { runChaiActionHooks } from "~/server/plugin-api/action-hooks";
import { ChaiBaseAction } from "../base-action";

export type UpdateWebsiteFieldsActionData = {
  settings: any;
};

type UpdateWebsiteFieldsActionResponse = {
  success: boolean;
};

/**
 * Action to update website settings (theme, designTokens, etc.)
 * Matches the behavior of the old ChaiBuilderWebsite.updateWebsiteSettings method
 */
export class UpdateWebsiteFieldsAction extends ChaiBaseAction<
  UpdateWebsiteFieldsActionData,
  UpdateWebsiteFieldsActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      settings: z.any(),
    });
  }

  async execute(data: UpdateWebsiteFieldsActionData): Promise<UpdateWebsiteFieldsActionResponse> {
    if (!this.context) {
      throw apiError("CONTEXT_NOT_SET", new Error("CONTEXT_NOT_SET"));
    }

    const { appId } = this.context;

    // Pick only the allowed columns from settings (matching old implementation)
    const columns = pick(data.settings, ["theme", "designTokens"]);
    // Fetch existing changes array from the database
    const { data: existingApp, error: fetchError } = await getAppFields(appId, ["changes"]);
    if (fetchError) {
      throw apiError("ERROR_UPDATE_WEBSITE_FIELDS", fetchError);
    }
    if (!existingApp) {
      throw apiError("ERROR_UPDATE_WEBSITE_FIELDS", new Error(`App ${appId} not found`));
    }
    const existingChanges = (existingApp.changes ?? []) as string[];
    // Map column names to their corresponding changes array keys
    const keyMap: Record<string, string> = {
      theme: "THEME",
      designTokens: "DESIGN_TOKENS",
    };
    const changedKeys = Object.keys(columns)
      .map((key) => keyMap[key])
      .filter(Boolean);
    const mergedChanges = [...new Set([...existingChanges, ...changedKeys])];
    // Build the update object with changes flag
    const updateData = {
      ...columns,
      changes: mergedChanges,
    };

    // Execute the update query
    const { error } = await updateAppFields(appId, updateData);

    if (error) {
      throw apiError("ERROR_UPDATE_WEBSITE_FIELDS", error);
    }

    if ("theme" in columns || "designTokens" in columns) {
      await runChaiActionHooks("theme:saved", {
        appId,
        userId: this.context.userId,
        snapshot: { theme: columns.theme, designTokens: columns.designTokens },
      });
    }

    return { success: true };
  }
}
