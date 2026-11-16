import { and, eq, getTableColumns, inArray, InferSelectModel, isNotNull, like } from "drizzle-orm";
import { flattenDeep, isEmpty, omit, uniq } from "lodash-es";
import { z } from "zod";
import { getAppFields, getAppRow, updateAppFields } from "~/server/chai-actions/apps/app-store";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { resolveEditSource } from "~/server/chai-actions/utils/edit-source";
import { LAYOUTS_INDEX_TAG } from "~/server/chai-builder/public/get-layout-id-by-name";
import { pageSlugTag, slugTag, upstreamSiteTag } from "~/server/chai-builder/public/page-routing-cache";
import { runChaiActionHooks } from "~/server/plugin-api/action-hooks";
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
      if ((data.ids ?? []).length === 0) {
        throw new ActionError("IDS_REQUIRED", "At least one page ID or THEME must be provided");
      }
      const ids = data.ids!;
      await this.assertNoTrashedPages(ids);

      // Site-wide ids run one after another: each read-modify-writes apps.changes, so running them
      // concurrently could let one publish put back the flag the other just cleared.
      const responses: PublishChangesActionResponse[] = [];
      if (ids.includes("THEME")) responses.push(await this.publishTheme());
      if (ids.includes("DESIGN_TOKENS")) responses.push(await this.publishDesignToken());
      const pageIds = ids.filter((id) => id !== "THEME" && id !== "DESIGN_TOKENS");
      responses.push(...(await Promise.all(pageIds.map((id) => this.publishPage(id)))));

      await this.clearChanges(ids);
      const tags = uniq(flattenDeep(responses.map((r) => r.tags)));
      const paths = uniq(flattenDeep(responses.map((r) => r.paths)));
      return { tags, paths };
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  /**
   * Refuse trashed pages before anything is published: publishing one re-creates its online
   * row, so the page serves again and stays listed in its parent's menu while hidden from the builder.
   */
  private async assertNoTrashedPages(ids: string[]): Promise<void> {
    const pageIds = ids.filter((id) => id !== "THEME" && id !== "DESIGN_TOKENS");
    if (pageIds.length === 0) return;
    const { data, error } = await safeQuery(() =>
      db
        .select({ id: schema.appPages.id })
        .from(schema.appPages)
        .where(
          and(
            inArray(schema.appPages.id, pageIds),
            eq(schema.appPages.app, this.appId),
            isNotNull(schema.appPages.deletedAt),
          ),
        ),
    );
    if (error) throw new ActionError("Error checking trashed pages", "ERROR_PUBLISHING_PAGE", 500, error);
    const trashed = (data ?? []).map((row) => row.id);
    if (trashed.length > 0) {
      throw new ActionError(`Cannot publish trashed pages: ${trashed.join(", ")}`, "PAGE_TRASHED", 409);
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
    // Theme and design tokens publish separately: the live tokens stay as they are.
    await this.upsertOnlineApp(app, "ERROR_PUBLISHING_THEME", "designTokens");

    await runChaiActionHooks("theme:published", {
      appId: this.appId,
      userId: this.context?.userId,
      snapshot: { theme: app.theme },
      revisions: this.revisionsEnabled,
    });

    // Remove 'THEME' from changes array, set null only if no other changes remain
    await this.removeFromChangesArray("THEME", "ERROR_PUBLISHING_THEME");

    return { tags: [`website-settings-${this.appId}`], paths: [] };
  }

  /**
   * Publish design token changes
   */
  private async publishDesignToken(): Promise<PublishChangesActionResponse> {
    const app = await this.cloneApp();
    // Theme and design tokens publish separately: the live theme stays as it is.
    await this.upsertOnlineApp(app, "ERROR_PUBLISHING_DESIGN_TOKEN", "theme");

    await runChaiActionHooks("theme:published", {
      appId: this.appId,
      userId: this.context?.userId,
      snapshot: { designTokens: app.designTokens },
      revisions: this.revisionsEnabled,
    });

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
   *
   * `keepOnline` names the column the other site-wide publish owns (theme vs design tokens): an
   * existing online row keeps its value, so publishing one never takes the other's draft live. A
   * first-ever publish still inserts the whole row — there is no live value to keep yet.
   */
  private async upsertOnlineApp(app: AppData, errorCode: string, keepOnline: "theme" | "designTokens"): Promise<void> {
    // Every draft column apps_online also has, so a column a host adds to both tables (a NOT NULL
    // site type, a derived jsonb snapshot) publishes with the rest instead of failing or going stale.
    // Deliberately excludes apiKey (lives only on apps_online) and createdAt (kept from the
    // existing online row); a draft-only column has no apps_online counterpart and is skipped.
    const onlineColumns = getTableColumns(schema.appsOnline);
    const publishedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(app)) {
      if (key === "id" || key === "createdAt" || key === "apiKey") continue;
      if (Object.hasOwn(onlineColumns, key)) publishedFields[key] = value;
    }
    publishedFields.changes = null;

    const { error } = await safeQuery(() =>
      db
        .insert(schema.appsOnline)
        .values({ id: app.id, createdAt: app.createdAt, ...publishedFields } as typeof schema.appsOnline.$inferInsert)
        .onConflictDoUpdate({
          target: schema.appsOnline.id,
          set: omit(publishedFields, keepOnline) as Partial<typeof schema.appsOnline.$inferInsert>,
        }),
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
    const { data: existingApp, error: fetchError } = await getAppFields(this.appId, ["changes"]);

    if (fetchError) {
      throw new ActionError("Error fetching changes", errorCode, 500, fetchError);
    }

    const existingChanges = (existingApp?.changes ?? []) as string[];
    const updatedChanges = existingChanges.filter((c) => c !== key);

    const { error: updateError } = await updateAppFields(this.appId, {
      changes: updatedChanges.length > 0 ? updatedChanges : null,
    });

    if (updateError) {
      throw new ActionError("Error updating changes", errorCode, 500, updateError);
    }
  }

  /**
   * Clone app data from main table
   */
  private async cloneApp(): Promise<AppData> {
    const { data, error } = await getAppRow(this.appId);

    if (error || !data) {
      throw new ActionError("Site not found", "SITE_NOT_FOUND", 404, error);
    }

    return data as AppData;
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
      // Linked pages merge this site's partials without listing them in `partialBlocks`.
      tags.push(upstreamSiteTag(this.appId));
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
        // Linked pages match their links to this site's pages by slug.
        tags.push(upstreamSiteTag(this.appId));
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
   * Add page to online table
   */
  private async addOnlinePage(page: AppPageData): Promise<AddOnlinePageResult> {
    // The outgoing live row is still in place: whoever keeps page history snapshots it now.
    await runChaiActionHooks("page:publishing", {
      appId: this.appId,
      pageId: page.id,
      revisions: this.revisionsEnabled,
    });

    const { error: deleteError } = await safeQuery(() =>
      db.delete(schema.appPagesOnline).where(eq(schema.appPagesOnline.id, page.id)),
    );

    if (deleteError) {
      throw new ActionError("Error deleting online page", "ERROR_PUBLISHING_PAGE", 500, deleteError);
    }

    // Destructure to remove fields that shouldn't be copied or are auto-generated
    const { changes: _changes, createdAt: _createdAt, ...pageData } = page;
    // Language pages render the primary's blocks (get-page.ts), and their cache invalidation rides
    // on the primary's row. Don't mirror orphaned draft blocks, or the partials/links derived from
    // them, into the online row: they only trigger redundant revalidations (#2842).
    if (pageData.primaryPage) Object.assign(pageData, { blocks: [], partialBlocks: "", links: "" });

    const { data, error } = await safeQuery(() =>
      db
        .insert(schema.appPagesOnline)
        .values({
          ...pageData,
          currentEditor: this.context?.userId,
          // A `page:publishing` subscriber may copy this row wholesale on the next
          // publish, so recording it here also attributes that snapshot.
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
    // Re-checked at read time: the page may have been trashed since assertNoTrashedPages.
    if (data.deletedAt) {
      throw new ActionError(`Cannot publish trashed page: ${id}`, "PAGE_TRASHED", 409);
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
