import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAppFields } from "~/server/chai-actions/apps/app-store";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";

/**
 * Data type for GetChangesAction
 */
export type GetChangesActionData = Record<string, never>; // Empty object

type PageChange = {
  id: string;
  slug: string;
  name: string;
  pageType: string | null;
  lang: string;
  changes: string[] | null;
  primaryPage: string | null;
  online: boolean | null;
  currentEditor?: string | null;
};

type GetChangesActionResponse = PageChange[];

/**
 * Action to get all pages with changes and offline pages
 * This includes:
 * - Pages with changes (where changes column is not null)
 * - Offline pages that can be taken online
 * - Theme changes if present
 */
export class GetChangesAction extends ChaiBaseAction<GetChangesActionData, GetChangesActionResponse> {
  private appId: string = "";

  /**
   * Define the validation schema for get changes action
   */
  protected getValidationSchema() {
    // No input data required for this action
    return z.object({});
  }

  /**
   * Execute the get changes action
   */
  async execute(): Promise<GetChangesActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    this.appId = this.context.appId;

    try {
      return await this.getChanges();
    } catch (error) {
      // Handle known errors
      if (error instanceof ActionError) {
        throw error;
      }

      // Convert other errors to ActionError
      const message = error instanceof Error ? error.message : "Failed to get changes";
      throw new ActionError(message, "GET_CHANGES_ERROR");
    }
  }

  /**
   * Main get changes logic
   */
  private async getChanges(): Promise<GetChangesActionResponse> {
    // Get pages with changes (where changes is not null)
    const { data: changedPages, error: changedPagesError } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          slug: schema.appPages.slug,
          name: schema.appPages.name,
          pageType: schema.appPages.pageType,
          lang: schema.appPages.lang,
          changes: schema.appPages.changes,
          primaryPage: schema.appPages.primaryPage,
          online: schema.appPages.online,
          currentEditor: schema.appPages.currentEditor,
        })
        .from(schema.appPages)
        .where(
          and(
            eq(schema.appPages.app, this.appId),
            isNotNull(schema.appPages.changes),
            // Trashed pages stay out of the publish list: publishing one puts it back online.
            isNull(schema.appPages.deletedAt),
          ),
        ),
    );

    if (changedPagesError) {
      throw new ActionError("Error getting changed pages", "ERROR_GETTING_CHANGES");
    }

    // Get offline pages (where currentEditor is null and online is false)
    const { data: offlinePages, error: offlinePagesError } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          slug: schema.appPages.slug,
          name: schema.appPages.name,
          pageType: schema.appPages.pageType,
          lang: schema.appPages.lang,
          changes: schema.appPages.changes,
          primaryPage: schema.appPages.primaryPage,
          online: schema.appPages.online,
        })
        .from(schema.appPages)
        .where(
          and(
            eq(schema.appPages.app, this.appId),
            isNull(schema.appPages.currentEditor),
            eq(schema.appPages.online, false),
            isNull(schema.appPages.deletedAt),
          ),
        ),
    );

    if (offlinePagesError) {
      throw new ActionError("Error getting offline pages", "ERROR_GETTING_OFFLINE_PAGES");
    }

    // Map offline pages to have changes: ["Take Online"]
    const takeOnlinePages = (offlinePages || []).map((page) => ({
      ...page,
      changes: ["Take Online"] as string[],
    }));

    // Filter changed pages to remove those that are in takeOnlinePages
    const filteredChangedPages = (changedPages || []).filter((page) => !takeOnlinePages.some((t) => t.id === page.id));

    // Merge the two arrays - cast changedPages to proper type since changes is returned as unknown from DB
    const mergedPages: PageChange[] = [
      ...filteredChangedPages.map((page) => ({
        ...page,
        changes: page.changes as string[],
      })),
      ...takeOnlinePages,
    ];

    // Check for theme changes in the apps table
    const { data: app, error: appsError } = await getAppFields(this.appId, ["changes"]);

    if (!appsError && app?.changes) {
      const appChanges = app.changes as string[];
      if (appChanges.includes("THEME")) {
        mergedPages.push({
          id: "THEME",
          slug: "",
          name: "Theme",
          pageType: "theme",
          lang: "",
          changes: ["Updated"],
          primaryPage: null,
          online: true,
        });
      }
      if (appChanges.includes("DESIGN_TOKENS")) {
        mergedPages.push({
          id: "DESIGN_TOKENS",
          slug: "",
          name: "Design Tokens",
          pageType: "design_tokens",
          lang: "",
          changes: ["Updated"],
          primaryPage: null,
          online: true,
        });
      }
    }

    return mergedPages;
  }
}
