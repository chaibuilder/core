import { and, eq, inArray, InferSelectModel, like } from "drizzle-orm";
import { flattenDeep, isEmpty, uniq } from "lodash-es";
import { z } from "zod";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { pruneRevisions } from "~/server/chai-actions/revisions/prune-revisions";
import { resolveEditSource } from "~/server/chai-actions/utils/edit-source";
import { LAYOUTS_INDEX_TAG } from "~/server/chai-builder/public/get-layout-id-by-name";
import { pageSlugTag, slugTag } from "~/server/chai-builder/public/page-routing-cache";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";

/**
 * Data type for PublishChangesAction
 */
export type PublishChangesActionData = {
  ids?: string[];
  revisions?: boolean;
};

type PublishChangesActionResponse = {
  tags: string[];
  paths: string[];
};

/**
 * Type for App data from the database
 */
type AppData = InferSelectModel<typeof schema.apps>;

/**
 * Type for AppPage data from the database
 */
type AppPageData = InferSelectModel<typeof schema.appPages>;

/**
 * Type for the return value when adding a page online
 */
type AddOnlinePageResult = {
  id: string;
  primaryPage: string | null;
};

/**
 * Action to publish changes to pages or theme
 */
export class PublishChangesAction extends ChaiBaseAction<PublishChangesActionData, PublishChangesActionResponse> {
  private appId: string = "";
  private revisionsEnabled: boolean = false;

  /**
   * Define the validation schema for publish changes action
   */
  protected getValidationSchema() {
    return z.object({
      ids: z.array(z.string()).optional(),
      revisions: z.boolean().optional(),
    });
  }

  /**
   * Execute the publish changes action
   */
  async execute(data: PublishChangesActionData): Promise<PublishChangesActionResponse> {
    this.validateContext();
    this.appId = this.context!.appId;
    this.revisionsEnabled = data.revisions ?? false;

    try {
      const ids = data.ids ?? [];
      if (ids.length === 0) {
        throw new ActionError("IDS_REQUIRED", "At least one page ID or THEME must be provided");
      }

      const responses = await Promise.all(
        ids.map((id) => {
          if (id === "THEME") {
            return this.publishTheme();
          }
          if (id === "DESIGN_TOKENS") {
            return this.publishDesignToken();
          }
          return this.publishPage(id);
        }),
      );

      await this.clearChanges(ids);
      const tags = uniq(flattenDeep(responses.map((r) => r.tags)));
      const paths = uniq(flattenDeep(responses.map((r) => r.paths)));
      return { tags, paths };
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  /**
   * Validate that context is properly set
   */
  private validateContext(): void {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
  }

  /**
   * Publish theme changes
   */
  private async publishTheme(): Promise<PublishChangesActionResponse> {
    const app = await this.cloneApp();
    await this.upsertOnlineApp(app, "ERROR_PUBLISHING_THEME");

    // Remove 'THEME' from changes array, set null only if no other changes remain
    await this.removeFromChangesArray("THEME", "ERROR_PUBLISHING_THEME");

    return { tags: [`website-settings-${this.appId}`], paths: [] };
  }

  /**
   * Publish design token changes
   */
  private async publishDesignToken(): Promise<PublishChangesActionResponse> {
    const app = await this.cloneApp();
    await this.upsertOnlineApp(app, "ERROR_PUBLISHING_DESIGN_TOKEN");

    // Remove 'DESIGN_TOKENS' from changes array, set null only if no other changes remain
    await this.removeFromChangesArray("DESIGN_TOKENS", "ERROR_PUBLISHING_DESIGN_TOKEN");

    return { tags: [`website-settings-${this.appId}`], paths: [] };
  }

  /**
   * Copy the draft app row onto its published apps_online row WITHOUT deleting it.
   *
   * The previous delete+reinsert had two problems: (1) apps_online has columns
   * the draft `apps` clone lacks (e.g. apiKey), so re-inserting the clone dropped
   * them / could violate constraints and fail the whole publish; (2) deleting the
   * apps_online row cascades to everything that references it (api_keys, messaging
   * tokens, oauth tokens), silently destroying them on every theme publish. Upsert
   * on the id instead: it preserves row identity (no cascade) and apps_online-only
   * columns (we never overwrite apiKey/createdAt), and still creates the row on a
   * first-ever publish.
   */
  private async upsertOnlineApp(app: AppData, errorCode: string): Promise<void> {
    // Columns copied from draft -> published. Deliberately excludes apiKey (lives
    // only on apps_online) and createdAt (kept from the existing online row).
    const publishedFields = {
      name: app.name,
      user: app.user,
      settings: app.settings,
      theme: app.theme,
      fallbackLang: app.fallbackLang,
      languages: app.languages,
      changes: null,
      deletedAt: app.deletedAt,
      client: app.client,
      designTokens: app.designTokens,
      ai: app.ai,
      configData: app.configData,
      consentConfig: app.consentConfig,
    };

    const { error } = await safeQuery(() =>
      db
        .insert(schema.appsOnline)
        .values({ id: app.id, createdAt: app.createdAt, ...publishedFields })
        .onConflictDoUpdate({ target: schema.appsOnline.id, set: publishedFields }),
    );

    if (error) {
      throw new ActionError("Error publishing online app", errorCode, 500, error);
    }
  }

  /**
   * Remove a specific key from the app's changes array.
   * Sets changes to null only if the array becomes empty after removal.
   */
  private async removeFromChangesArray(key: string, errorCode: string): Promise<void> {
    // Fetch existing changes array
    const { data: existingApp, error: fetchError } = await safeQuery(() =>
      db.select({ changes: schema.apps.changes }).from(schema.apps).where(eq(schema.apps.id, this.appId)),
    );

    if (fetchError) {
      throw new ActionError("Error fetching changes", errorCode, 500, fetchError);
    }

    const existingChanges = (existingApp?.[0]?.changes ?? []) as string[];
    const updatedChanges = existingChanges.filter((c) => c !== key);

    const { error: updateError } = await safeQuery(() =>
      db
        .update(schema.apps)
        .set({ changes: updatedChanges.length > 0 ? updatedChanges : null })
        .where(eq(schema.apps.id, this.appId)),
    );

    if (updateError) {
      throw new ActionError("Error updating changes", errorCode, 500, updateError);
    }
  }

  /**
   * Clone app data from main table
   */
  private async cloneApp(): Promise<AppData> {
    const { data, error } = await safeQuery(() =>
      db.query.apps.findFirst({
        where: eq(schema.apps.id, this.appId),
      }),
    );

    if (error || !data) {
      throw new ActionError("Site not found", "SITE_NOT_FOUND", 404, error);
    }

    return data;
  }

  /**
   * Clear changes flag after publishing
   */
  private async clearChanges(ids: string[]): Promise<void> {
    // remove THEME and DESIGN_TOKENS from ids
    const pageIds = ids.filter((id) => id !== "THEME" && id !== "DESIGN_TOKENS");

    if (pageIds.length === 0) {
      return;
    }

    const { error } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({ changes: null, online: true })
        .where(and(inArray(schema.appPages.id, pageIds), eq(schema.appPages.app, this.appId))),
    );

    if (error) {
      throw new ActionError("Error clearing changes", "ERROR_CLEARING_CHANGES", 500, error);
    }
  }

  /**
   * Get pages that link to a specific page
   */
  private async getLinkingPages(id: string): Promise<PublishChangesActionResponse> {
    const { data } = await safeQuery(() =>
      db.query.appPagesOnline.findMany({
        where: and(eq(schema.appPagesOnline.app, this.appId), like(schema.appPagesOnline.links, `%${id}%`)),
        columns: {
          id: true,
          slug: true,
        },
      }),
    );

    const tags: string[] = [];
    const paths: string[] = [];
    (data ?? []).forEach((row) => {
      tags.push(`page-${row.id}`);
      if (!isEmpty(row.slug)) {
        paths.push(row.slug);
      }
    });

    return { tags, paths };
  }

  /**
   * Get pages that use a partial block
   */
  private async getPartialBlockUsage(id: string): Promise<PublishChangesActionResponse> {
    const { data } = await safeQuery(() =>
      db.query.appPagesOnline.findMany({
        where: and(eq(schema.appPagesOnline.app, this.appId), like(schema.appPagesOnline.partialBlocks, `%${id}%`)),
        columns: {
          id: true,
          slug: true,
        },
      }),
    );

    const tags: string[] = [];
    const paths: string[] = [];
    (data ?? []).forEach((row) => {
      tags.push(`page-${row.id}`);
      if (!isEmpty(row.slug)) {
        paths.push(row.slug);
      }
    });

    return { tags, paths };
  }

  /**
   * Get the currently online slug for a page. Returns undefined when the
   * page has never been published (no online row).
   */
  private async getOldOnlineSlug(id: string): Promise<string | null | undefined> {
    const { data } = await safeQuery(() =>
      db.query.appPagesOnline.findFirst({
        where: and(eq(schema.appPagesOnline.id, id), eq(schema.appPagesOnline.app, this.appId)),
        columns: { slug: true },
      }),
    );
    return data ? data.slug : undefined;
  }

  /**
   * Publish a single page
   */
  private async publishPage(id: string): Promise<PublishChangesActionResponse> {
    const page = await this.clonePage(id);
    // Read before addOnlinePage deletes the online row
    const oldSlug = await this.getOldOnlineSlug(page.id);
    await this.addOnlinePage(page);

    const pageId = page.primaryPage ?? page.id;
    const tags = [`page-${pageId}`, `breadcrumb-${pageId}`];
    const paths: string[] = [];
    if (isEmpty(page.slug)) {
      const usage = await this.getPartialBlockUsage(pageId);
      tags.push(...usage.tags);
      paths.push(...usage.paths);
      if (page.pageType === "_layout") {
        tags.push(LAYOUTS_INDEX_TAG);
      }
    } else {
      paths.push(`${page.slug}`);
      tags.push(slugTag(page.slug));

      // First publish counts as a slug change: linking pages may have
      // cached "no slug" for this id and rendered dead hrefs.
      const slugChanged = isEmpty(oldSlug) || oldSlug !== page.slug;
      if (slugChanged) {
        // Links may carry either the primary or the variant id
        const linkTargetIds = uniq([pageId, page.id]);
        for (const targetId of linkTargetIds) {
          tags.push(pageSlugTag(targetId));
          const linkedPages = await this.getLinkingPages(targetId);
          tags.push(...linkedPages.tags);
          paths.push(...linkedPages.paths);
        }
        if (!isEmpty(oldSlug)) {
          tags.push(slugTag(oldSlug!));
        }
      }
    }

    return { tags: uniq(tags), paths: uniq(paths) };
  }

  /**
   * Create a revision before publishing
   */
  private async createRevision(pageId: string): Promise<boolean> {
    // Skip revision creation if revisions are disabled
    if (!this.revisionsEnabled) {
      return false;
    }

    const { data: page, error } = await safeQuery(() =>
      db.query.appPagesOnline.findFirst({
        where: eq(schema.appPagesOnline.id, pageId),
      }),
    );

    if (error || !page || !isEmpty(page.primaryPage)) {
      // if the page has a primary page, we don't want to create a revision
      return false;
    }

    const { error: revisionError } = await safeQuery(() =>
      db.insert(schema.appPagesRevisions).values({
        ...page,
        type: "published",
        uid: undefined, // Let database generate new uid
      }),
    );

    if (revisionError) {
      throw new ActionError("Error creating revision", "ERROR_CREATING_REVISION", 500, revisionError);
    }

    await pruneRevisions(pageId, page.app);

    return true;
  }

  /**
   * Add page to online table
   */
  private async addOnlinePage(page: AppPageData): Promise<AddOnlinePageResult> {
    // Create revision and delete existing online page
    await this.createRevision(page.id);

    const { error: deleteError } = await safeQuery(() =>
      db.delete(schema.appPagesOnline).where(eq(schema.appPagesOnline.id, page.id)),
    );

    if (deleteError) {
      throw new ActionError("Error deleting online page", "ERROR_PUBLISHING_PAGE", 500, deleteError);
    }

    // Destructure to remove fields that shouldn't be copied or are auto-generated
    const { changes: _changes, createdAt: _createdAt, ...pageData } = page;

    const { data, error } = await safeQuery(() =>
      db
        .insert(schema.appPagesOnline)
        .values({
          ...pageData,
          currentEditor: this.context?.userId,
          // `createRevision` copies this row wholesale on the next publish, so
          // recording it here also attributes the published revision snapshot.
          source: resolveEditSource(this.context),
        })
        .returning(),
    );

    if (error || !data || data.length === 0) {
      throw new ActionError("Error publishing page", "ERROR_PUBLISHING_PAGE", 500, error);
    }

    const { error: updateError } = await safeQuery(() =>
      db.update(schema.appPages).set({ changes: null }).where(eq(schema.appPages.id, page.id)),
    );

    if (updateError) {
      throw new ActionError("Error clearing page changes", "ERROR_PUBLISHING_PAGE", 500, updateError);
    }

    return data[0];
  }

  /**
   * Clone page data from main table
   */
  private async clonePage(id: string): Promise<AppPageData> {
    const { data, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, id), eq(schema.appPages.app, this.appId)),
      }),
    );

    if (error || !data) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND", 404, error);
    }

    return data;
  }

  /**
   * Handle execution errors with proper error transformation
   */
  private handleExecutionError(error: unknown): never {
    if (error instanceof ActionError) {
      throw error;
    }

    throw new ActionError(
      `Failed to publish changes: ${error instanceof Error ? error.message : "Unknown error"}`,
      "PUBLISH_CHANGES_FAILED",
    );
  }
}
