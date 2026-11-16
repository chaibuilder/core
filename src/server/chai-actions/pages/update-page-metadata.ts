import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { pageDetailsTagsForMutation } from "~/server/chai-builder/public/page-details-cache";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";

/**
 * Data type for UpdatePageMetadataAction
 */
export type UpdatePageMetadataActionData = {
  id: string;
  metadata: Record<string, unknown>;
};

type UpdatePageMetadataActionResponse = {
  success: boolean;
  tags: string[];
};

/**
 * Action to update page metadata
 */
export class UpdatePageMetadataAction extends ChaiBaseAction<
  UpdatePageMetadataActionData,
  UpdatePageMetadataActionResponse
> {
  /**
   * Define the validation schema for update page metadata action
   */
  protected getValidationSchema() {
    return z.object({
      id: z.string().nonempty(),
      metadata: z.record(z.string(), z.any()),
    });
  }

  /**
   * Execute the update page metadata action
   */
  async execute(data: UpdatePageMetadataActionData): Promise<UpdatePageMetadataActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    const { appId } = this.context;

    // Check if page exists
    const { data: originalPage, error: fetchError } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, data.id), eq(schema.appPages.app, appId)),
        columns: {
          id: true,
          changes: true,
        },
      }),
    );

    if (fetchError) {
      throw new ActionError(`Failed to fetch page: ${fetchError.message}`, "FETCH_FAILED");
    }

    if (!originalPage) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND");
    }

    // Also flag the page as pending publish with "Updated" (UPDATE_PAGE's
    // generic marker), or a metadata-only edit never shows in the publish
    // dialog. Existing markers are kept.
    // ponytail: read-then-write, a concurrent save's marker can be lost; move
    // to a DB-side jsonb merge if that shows up.
    const existing = Array.isArray(originalPage.changes) ? (originalPage.changes as string[]) : [];
    const changes = existing.includes("Updated") ? existing : [...existing, "Updated"];
    const { error: updateError } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({ metadata: data.metadata, changes })
        .where(and(eq(schema.appPages.id, data.id), eq(schema.appPages.app, appId))),
    );

    if (updateError) {
      console.error(updateError);
      throw new ActionError("Failed to update page metadata", "UPDATE_FAILED");
    }

    return {
      success: true,
      tags: pageDetailsTagsForMutation(data.id),
    };
  }
}
