import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { isEmpty, keys, pick } from "lodash-es";
import { z } from "zod";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { hasPermission } from "~/server/rbac/permissions";
import { pruneRevisions } from "~/server/chai-actions/revisions/prune-revisions";
import { resolveEditSource } from "~/server/chai-actions/utils/edit-source";
import { PageTreeBuilder } from "~/server/chai-actions/utils/page-tree-builder";
import { getConfigFeature } from "~/server/defaults/config-registry";
import { pageDetailsTagsForMutation } from "~/server/chai-builder/public/page-details-cache";
import { routingTagsForMutation, type RoutingSlugUpdate } from "~/server/chai-builder/public/page-routing-cache";
import { computePartialIdsClosure } from "~/server/chai-builder/public/partial-merge-utils";
import { ChaiBlock } from "~/types/common";
import { derivePageRefs } from "~/utils/derive-page-refs";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";
import { runChaiActionHooks } from "~/server/plugin-api/action-hooks";
import {
  applySlugRewrites,
  collectDescendantSlugUpdates,
  demoteExistingHomepage,
  findExistingHomepage,
  type HomepageSlugUpdate,
} from "./demote-existing-homepage";
import { normalizeTags, PARTIAL_TAGS_METADATA_KEY } from "./partial-metadata";
import { SlugChangeHandler } from "./slug-change-handler";

/**
 * Data type for UpdatePageAction
 */
export type UpdatePageActionData = {
  //primary keys
  id: string;

  // templates columns
  blocks?: ChaiBlock[];
  currentEditor?: string;

  // pages table
  slug?: string;
  name?: string;
  seo?: Record<string, any>;
  buildTime?: boolean;
  parent?: string | null;
  pageType?: string;
  dynamic?: boolean;
  dynamicSlugCustom?: string;
  needTranslations?: boolean;
  /** AI-facing description, primarily used for partials. Merged into metadata.description. */
  description?: string;
  /** Free-form, site-specific tags for partials/global blocks. Merged into the namespaced metadata key `__tags` (PARTIAL_TAGS_METADATA_KEY). */
  tags?: string[];
  metadata?: Record<string, unknown>;
  links?: string;
  partialBlocks?: string;
  /** @deprecated Ignored — the closure is recomputed from `blocks` server-side. */
  partialIds?: string[];
  /** @deprecated Ignored — derived from `blocks` server-side (see `derivePageRefs`). */
  linkPageIds?: string[];
  /** @deprecated Ignored — derived from `blocks` server-side (see `derivePageRefs`). */
  designTokens?: Record<string, Record<string, string>>;
  tracking?: Record<string, any>;
  /** @deprecated Ignored — decided server-side from `features.revisions.drafts`. */
  addInRevision?: boolean;
};

type UpdatePageActionResponse = {
  success?: boolean;
  page?: any;
  tags?: string[];
  code?: string;
  editor?: string;
};

const ROUTING_PAGE_FIELDS = new Set(["slug", "name", "parent", "pageType", "dynamic", "dynamicSlugCustom"]);

/**
 * Action to update a page
 */
export class UpdatePageAction extends ChaiBaseAction<UpdatePageActionData, UpdatePageActionResponse> {
  private appId: string = "";
  private pageTreeBuilder?: PageTreeBuilder;
  private slugChangeHandler?: SlugChangeHandler;
  private routingSlugUpdates: RoutingSlugUpdate[] = [];
  private redirectTags: string[] = [];

  /**
   * Define the validation schema for update page action
   */
  protected getValidationSchema() {
    return z.object({
      id: z.string().nonempty(),
      blocks: z.array(z.any()).optional(),
      currentEditor: z.string().optional(),
      slug: z.string().optional(),
      name: z.string().optional(),
      seo: z.record(z.string(), z.any()).optional(),
      buildTime: z.boolean().optional(),
      parent: z.union([z.string(), z.null()]).optional(),
      pageType: z.string().optional(),
      dynamic: z.boolean().optional(),
      dynamicSlugCustom: z.string().optional(),
      needTranslations: z.boolean().optional(),
      description: z.string().optional(),
      tags: z.array(z.string().min(1).max(50)).optional(),
      tracking: z.record(z.string(), z.any()).optional(),
      // Accepted but ignored — now derived/decided server-side. Kept so
      // existing clients that still send them don't fail validation.
      partialIds: z.array(z.string()).optional(),
      linkPageIds: z.array(z.string()).optional(),
      designTokens: z.record(z.string(), z.record(z.string(), z.string())).optional(),
      addInRevision: z.boolean().optional(),
    });
  }

  /**
   * Execute the update page action
   */
  async execute(data: UpdatePageActionData): Promise<UpdatePageActionResponse> {
    this.validateContext();
    this.appId = this.context!.appId;
    this.routingSlugUpdates = [];
    this.redirectTags = [];
    try {
      if (this.isOnlyBlocksUpdate(data)) {
        // Language pages (primaryPage IS NOT NULL) are metadata-only rows:
        // their blocks are never read — content is always resolved from the
        // primary page's blocks. Skip the write so we never deposit dead/stale
        // blocks on them (#2842).
        if (!(await this.isLanguagePage(data.id))) {
          await this.updateBlocks(data.id, data.blocks!);
        }
        return await this.buildResponse(data.id, data);
      }

      const filteredData = this.extractAllowedPageFields(data);

      await this.enforcePageTypeRules(data.id, filteredData);

      // Merge a partial's AI-facing description and/or tags into the metadata jsonb
      // column, preserving any other keys already stored there.
      if (data.description !== undefined || data.tags !== undefined) {
        filteredData.metadata = await this.buildMergedMetadata(data.id, {
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.tags !== undefined ? { [PARTIAL_TAGS_METADATA_KEY]: normalizeTags(data.tags) } : {}),
        });
      }

      // Initialize SlugChangeHandler
      this.slugChangeHandler = new SlugChangeHandler(this.appId);

      // Check if slug or parent is being changed
      const isSlugChanged = await this.slugChangeHandler.isSlugChanged(data.id, filteredData.slug);
      const isParentChanged = await this.slugChangeHandler.isParentChanged(data.id, filteredData.parent);

      await this.enforceHomepageRules(data.id, filteredData);

      // Promoting a page to the homepage: the current homepage (if any) hands
      // over "/" first — renamed and unpublished — so the slug-availability
      // check below sees a free root path. (The db layer has no cross-dialect
      // transactions, so the handoff cannot be atomic with the update below.)
      let demotedHomepageTags: string[] = [];
      let promotedVariants: Array<{ id: string; slug: string | null; lang: string | null }> = [];
      const isHomepagePromotion = isSlugChanged && filteredData.slug === "/";
      if (isHomepagePromotion) {
        // The promoted page's language variants move to their homepage routes
        // (/<lang>) below — captured (and their targets checked) before any writes.
        promotedVariants = await this.getLanguageVariants(data.id);
        await this.assertVariantHomepageRoutesFree(data.id, promotedVariants);

        if (await findExistingHomepage(this.appId, data.id)) {
          // Demotion unpublishes the current homepage's live rows — unpublishing is
          // deliberately gated on its own permission (TAKE_OFFLINE), so require it here too.
          if (!hasPermission(this.context?.userAccess?.permissions ?? null, CHAI_PERMISSIONS["pages:unpublish"])) {
            throw new ActionError(
              `Replacing the current homepage requires permission: ${CHAI_PERMISSIONS["pages:unpublish"]}`,
              "FORBIDDEN",
              403,
            );
          }
          demotedHomepageTags = await demoteExistingHomepage(this.appId, data.id);
        }
      }

      if (isParentChanged && filteredData.parent !== undefined) {
        // Parent change takes priority (it also updates slugs)
        // This handles both parent-only changes and parent+slug changes
        this.pageTreeBuilder = new PageTreeBuilder(this.appId);
        this.slugChangeHandler.setPageTreeBuilder(this.pageTreeBuilder);
        await this.handleParentChangeWithHandler(data.id, filteredData);
      } else if (isSlugChanged && filteredData.slug) {
        // Slug change only (no parent change)
        this.pageTreeBuilder = new PageTreeBuilder(this.appId);
        this.slugChangeHandler.setPageTreeBuilder(this.pageTreeBuilder);
        await this.handleSlugChangeWithHandler(data.id, filteredData);
      } else {
        // Simple update without slug or parent change
        await this.updatePageInDatabase(data.id, filteredData);
      }

      // The slug handlers cascade the promoted page's own children but not its
      // language variants — move those (and their children) to /<lang> now.
      if (isHomepagePromotion && promotedVariants.length > 0) {
        await this.moveVariantsToHomepageRoutes(promotedVariants);
      }

      // Slugs are already live in the online table at this point, so the old URLs are 404ing
      // until whoever subscribed (the redirects plugin) reacts. No-op when nothing moved.
      this.redirectTags = await runChaiActionHooks("page:slug-changed", {
        appId: this.appId,
        slugUpdates: this.routingSlugUpdates,
        userId: this.context?.userId,
      });
      this.redirectTags = [...this.redirectTags, ...demotedHomepageTags];

      // A draft-only page promoted to "/" is filtered out of the slug-changed
      // handling above (it has no live row), so any pre-existing redirect
      // answering the root path would keep shadowing it. Claim the path
      // explicitly, as the create path does, so subscribers clear it.
      if (isSlugChanged && filteredData.slug === "/") {
        const pathClaimedTags = await runChaiActionHooks("page:path-claimed", { appId: this.appId, slug: "/" });
        this.redirectTags = [...this.redirectTags, ...pathClaimedTags];
      }

      await this.syncDynamicFieldsToSecondaryPages(data.id, filteredData);

      return await this.buildResponse(data.id, filteredData);
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  async updateBlocks(pageId: string, blocks: ChaiBlock[]) {
    // Every denormalized column below is a pure function of `blocks`, so it is
    // derived here rather than taken from the request: a client that omits them
    // (the MCP tools send `{ id, blocks }`) would otherwise blank the columns,
    // and a client that sends them can only be as correct as the state it
    // happened to have loaded.
    const { linkPageIds, designTokens } = derivePageRefs(blocks);
    let partialBlocks: string | undefined;
    let reindexConsumers = false;
    try {
      const { data: currentRow } = await safeQuery(() =>
        db
          .select({ slug: schema.appPages.slug, partialBlocks: schema.appPages.partialBlocks })
          .from(schema.appPages)
          .where(and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)))
          .limit(1),
      );
      partialBlocks = (await computePartialIdsClosure(blocks, this.appId)).join("|");
      // When a partial's own closure changes (a nested partial was added or
      // removed), every page embedding it carries a now-stale closure — those
      // columns drive usage lookups (publish revalidation, delete, take
      // offline), so they must be reindexed.
      const row = currentRow?.[0];
      reindexConsumers = !!row && isEmpty(row.slug) && ((row.partialBlocks as string) ?? "") !== partialBlocks;
    } catch (error) {
      // Leave the stored closure alone rather than writing a wrong one — a
      // stale value still resolves the partials this page had, an empty one
      // would drop the page out of every usage lookup.
      console.error("Failed to recompute partial ids closure, leaving the stored value unchanged:", { pageId, error });
    }
    await this.updatePageInDatabase(pageId, {
      blocks,
      links: linkPageIds.join("|"),
      ...(partialBlocks !== undefined ? { partialBlocks } : {}),
      designTokens,
    });

    if (reindexConsumers) {
      await this.reindexPartialConsumers(pageId, new Set([pageId]));
    }
  }

  /**
   * Recompute the partialBlocks closure of every draft page that uses the
   * given partial (their column always contains their direct refs, so a
   * LIKE lookup finds them all). Cascades through partials that embed this
   * partial so nested consumers stay correct too. Soft-fails per page — a
   * reindex failure must never block the save that triggered it.
   */
  private async reindexPartialConsumers(partialId: string, visited: Set<string>): Promise<void> {
    const { data: consumers } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          slug: schema.appPages.slug,
          blocks: schema.appPages.blocks,
          partialBlocks: schema.appPages.partialBlocks,
        })
        .from(schema.appPages)
        .where(
          and(
            eq(schema.appPages.app, this.appId),
            like(schema.appPages.partialBlocks, `%${partialId}%`),
            isNull(schema.appPages.deletedAt),
          ),
        ),
    );

    for (const consumer of consumers ?? []) {
      if (visited.has(consumer.id)) continue;
      visited.add(consumer.id);
      // Guard against LIKE substring false positives
      if (!(((consumer.partialBlocks as string) ?? "").split("|").includes(partialId))) continue;
      try {
        const closure = (await computePartialIdsClosure((consumer.blocks as ChaiBlock[]) ?? [], this.appId)).join("|");
        if (closure === (((consumer.partialBlocks as string)) ?? "")) continue;
        const { error } = await safeQuery(() =>
          db
            .update(schema.appPages)
            .set({ partialBlocks: closure })
            .where(and(eq(schema.appPages.id, consumer.id), eq(schema.appPages.app, this.appId))),
        );
        if (error) throw error;
        // A partial embedding this partial has consumers of its own
        if (isEmpty(consumer.slug)) {
          await this.reindexPartialConsumers(consumer.id, visited);
        }
      } catch (error) {
        console.error("Failed to reindex partial consumer:", { partialId, consumerId: consumer.id, error });
      }
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
   * Guards the folder rules that the builder UI enforces client-side only.
   *
   * Changing a page's type is a routing change, not an ordinary field edit: making a
   * page a folder hides it from every resolver, and the reverse hands a folder's
   * claimed URL real content. `pages:update` — this action's declared permission — is
   * far more widely granted than `pages:change_type`, so without this the dropdown's
   * check is the *only* thing standing between a `pages:update` holder and any type
   * transition, and the "one-way conversion" rule is unenforced.
   *
   * The `requiredPermission` function form cannot express this: it sees the payload
   * but not the stored row, so it cannot tell a real change from a no-op resend.
   */
  private async enforcePageTypeRules(pageId: string, filteredData: Partial<UpdatePageActionData>): Promise<void> {
    const { pageType: nextPageType, dynamic } = filteredData;

    if (nextPageType === undefined && dynamic === undefined) return;

    const { data: page, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)),
        columns: { pageType: true },
      }),
    );

    if (error) {
      throw new ActionError(`Failed to fetch page type: ${error.message}`, "FETCH_FAILED");
    }

    // Missing or out-of-app row: the update itself resolves nothing and fails downstream.
    if (!page) return;

    const currentPageType = page.pageType ?? null;
    const effectivePageType = nextPageType ?? currentPageType;

    // A dynamic folder resolves through the dynamic-candidate path and renders at its
    // own URL — the same hole CreatePageAction rejects, reachable by a later update.
    if (effectivePageType === "_folder" && dynamic) {
      throw new ActionError("Folder cannot be dynamic", "FOLDER_CANNOT_BE_DYNAMIC");
    }

    if (nextPageType === undefined || nextPageType === currentPageType) return;

    // Scoped to folder conversions only. Every other page-type change keeps its
    // existing behaviour under `pages:update` — widening the gate to all type changes
    // would alter callers this feature never touched.
    if (nextPageType !== "_folder" && currentPageType !== "_folder") return;

    if (!hasPermission(this.context?.userAccess?.permissions ?? null, CHAI_PERMISSIONS["pages:change_type"])) {
      throw new ActionError(`Missing permission: ${CHAI_PERMISSIONS["pages:change_type"]}`, "FORBIDDEN", 403);
    }

    // Conversion is one-way by design: folder → page only.
    if (nextPageType === "_folder") {
      throw new ActionError("A page cannot be converted to a folder", "FOLDER_CONVERSION_ONE_WAY");
    }
  }

  /**
   * Only a root-level primary page of the built-in "page" type can hold the "/"
   * slug. Checked against the update's *effective* state (payload merged over
   * the stored row), so it also rejects a child updated to "/" and an existing
   * homepage changed to another page type while keeping "/".
   */
  private async enforceHomepageRules(pageId: string, filteredData: Partial<UpdatePageActionData>): Promise<void> {
    if (
      filteredData.slug === undefined &&
      filteredData.pageType === undefined &&
      filteredData.parent === undefined
    ) {
      return;
    }

    const { data: page, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)),
        columns: { slug: true, pageType: true, parent: true, primaryPage: true },
      }),
    );

    if (error) {
      throw new ActionError(`Failed to fetch page: ${error.message}`, "FETCH_FAILED");
    }

    // Missing or out-of-app row: the update itself resolves nothing and fails downstream.
    if (!page) return;

    const effectiveSlug = filteredData.slug ?? page.slug;
    if (effectiveSlug !== "/") return;

    const effectivePageType = filteredData.pageType ?? page.pageType;
    const effectiveParent = filteredData.parent !== undefined ? filteredData.parent : (page.parent ?? null);

    // Root-level means parent is exactly null — the schema accepts "", and
    // treating it as root would demote the current homepage before the slug
    // update fails on the invalid foreign key.
    if (effectivePageType !== "page" || effectiveParent !== null || page.primaryPage) {
      throw new ActionError(
        "Only a root-level page of type 'page' can be the homepage",
        "INVALID_HOMEPAGE_PAGE_TYPE",
      );
    }
  }

  /**
   * Language variants (secondary rows) of a page.
   */
  private async getLanguageVariants(
    pageId: string,
  ): Promise<Array<{ id: string; slug: string | null; lang: string | null }>> {
    const { data: variants, error } = await safeQuery(() =>
      db
        .select({ id: schema.appPages.id, slug: schema.appPages.slug, lang: schema.appPages.lang })
        .from(schema.appPages)
        .where(
          and(
            eq(schema.appPages.primaryPage, pageId),
            eq(schema.appPages.app, this.appId),
            isNull(schema.appPages.deletedAt),
          ),
        ),
    );
    if (error) {
      throw new ActionError(`Failed to look up language variants: ${error.message}`, "FETCH_FAILED");
    }
    return variants ?? [];
  }

  /**
   * A promotion moves each language variant to /<lang>; reject up front when a
   * page outside the handoff (not this page's variants and not the outgoing
   * homepage's) already owns one of those routes, so nothing is demoted for a
   * promotion that cannot complete.
   */
  private async assertVariantHomepageRoutesFree(
    pageId: string,
    variants: Array<{ id: string; slug: string | null; lang: string | null }>,
  ): Promise<void> {
    const targets = variants.filter((variant) => variant.lang).map((variant) => `/${variant.lang}`);
    if (targets.length === 0) return;

    const { data: occupants, error } = await safeQuery(() =>
      db
        .select({ id: schema.appPages.id, primaryPage: schema.appPages.primaryPage, slug: schema.appPages.slug })
        .from(schema.appPages)
        .where(
          and(
            inArray(schema.appPages.slug, targets),
            eq(schema.appPages.app, this.appId),
            isNull(schema.appPages.deletedAt),
          ),
        ),
    );
    if (error) {
      throw new ActionError(`Failed to check language homepage routes: ${error.message}`, "FETCH_FAILED");
    }

    const existingHomepage = await findExistingHomepage(this.appId, pageId);
    const conflict = (occupants ?? []).find(
      (occupant) => occupant.primaryPage !== pageId && occupant.primaryPage !== existingHomepage?.id,
    );
    if (conflict) {
      throw new ActionError(
        `Slug '${conflict.slug}' is already in use. Please choose another slug`,
        "SLUG_ALREADY_EXISTS",
      );
    }
  }

  /**
   * Moves the promoted page's language variants to /<lang> (with their
   * children) and folds the rewrites into this update's routing slug updates.
   */
  private async moveVariantsToHomepageRoutes(
    variants: Array<{ id: string; slug: string | null; lang: string | null }>,
  ): Promise<void> {
    const updates: HomepageSlugUpdate[] = [];
    for (const variant of variants) {
      if (!variant.lang || !variant.slug) continue;
      const newSlug = `/${variant.lang}`;
      if (variant.slug === newSlug) continue;
      updates.push({ id: variant.id, oldSlug: variant.slug, newSlug });
      updates.push(...(await collectDescendantSlugUpdates(this.appId, variant.id, variant.slug, newSlug)));
    }
    if (updates.length === 0) return;

    await applySlugRewrites(this.appId, updates);

    // The variants may already carry an entry from the parent-change handler;
    // replace it so redirects and cache tags reflect the actual final route.
    const movedIds = new Set(updates.map((update) => update.id));
    this.routingSlugUpdates = [
      ...this.routingSlugUpdates.filter((update) => !movedIds.has(update.id)),
      ...updates,
    ];
  }

  /**
   * Extract only the allowed fields for page updates
   */
  private extractAllowedPageFields(data: UpdatePageActionData): Partial<UpdatePageActionData> {
    return pick(data, [
      "slug",
      "name",
      "seo",
      "blocks",
      "currentEditor",
      "buildTime",
      "parent",
      "pageType",
      "dynamic",
      "dynamicSlugCustom",
      "tracking",
    ]);
  }

  /**
   * Merge a metadata patch into the page's existing metadata jsonb, keeping other keys intact.
   */
  private async buildMergedMetadata(
    pageId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data: page, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)),
        columns: { metadata: true },
      }),
    );

    if (error) {
      throw new ActionError(`Failed to fetch page metadata: ${error.message}`, "FETCH_FAILED");
    }

    if (!page) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND");
    }

    const existing = (page.metadata as Record<string, unknown>) ?? {};
    return { ...existing, ...patch };
  }

  /**
   * Handle slug change using SlugChangeHandler
   */
  private async handleSlugChangeWithHandler(
    pageId: string,
    filteredData: Partial<UpdatePageActionData>,
  ): Promise<void> {
    // Get slug updates from handler
    const slugUpdates = await this.slugChangeHandler!.handleSlugChangeWithTree(pageId, filteredData);
    this.routingSlugUpdates = slugUpdates;

    // Batch update all slugs
    const changes = this.determineChangeTypes(filteredData);
    await this.slugChangeHandler!.batchUpdateSlugs(slugUpdates, filteredData, pageId, changes);
  }

  /**
   * Handle parent change using SlugChangeHandler
   */
  private async handleParentChangeWithHandler(
    pageId: string,
    filteredData: Partial<UpdatePageActionData>,
  ): Promise<void> {
    // Get slug updates from handler
    const slugUpdates = await this.slugChangeHandler!.handleParentChangeWithTree(pageId, filteredData);
    this.routingSlugUpdates = slugUpdates;

    // Batch update all slugs
    const changes = this.determineChangeTypes(filteredData);
    await this.slugChangeHandler!.batchUpdateSlugs(slugUpdates, filteredData, pageId, changes);
  }

  /**
   * Determine what type of changes are being made
   */
  private determineChangeTypes(filteredData: Partial<UpdatePageActionData>): string[] {
    const changes: string[] = [];
    const dataKeys = keys(filteredData);

    if (dataKeys.includes("blocks")) {
      changes.push("Page");
    }
    if (dataKeys.includes("seo")) {
      changes.push("SEO");
    }

    return changes.length > 0 ? changes : ["Updated"];
  }

  private async addSaveEntryInRevision(
    pageId: string,
    page: any,
  ) {
    try {
      const { data: lastPublishedResult } = await safeQuery(() =>
        db.select({ currentEditor: schema.appPagesOnline.currentEditor, createdAt: schema.appPagesOnline.createdAt })
          .from(schema.appPagesOnline)
          .where(and(eq(schema.appPagesOnline.app, this.appId), eq(schema.appPagesOnline.id, pageId)))
          .orderBy(desc(schema.appPagesOnline.createdAt))
          .limit(1)
      );
      
      const { data: lastDraftResult } = await safeQuery(() =>
        db.select({ uid: schema.appPagesRevisions.uid, type: schema.appPagesRevisions.type, currentEditor: schema.appPagesRevisions.currentEditor, source: schema.appPagesRevisions.source, createdAt: schema.appPagesRevisions.createdAt })
          .from(schema.appPagesRevisions)
          .where(and(eq(schema.appPagesRevisions.id, pageId), eq(schema.appPagesRevisions.app, this.appId)))
          .orderBy(desc(schema.appPagesRevisions.createdAt))
          .limit(1)
      );

      const published = lastPublishedResult?.[0];
      const draft = lastDraftResult?.[0];
      const source = resolveEditSource(this.context);

      // `source` joins the coalesce key: an MCP token carries the uid of the
      // person who created it, so without it an agent edit would silently merge
      // into that person's own last draft and inherit its attribution.
      let shouldUpdateLastDraftEntry =
        draft &&
        draft.type === 'draft' &&
        draft.currentEditor === this.context?.userId &&
        draft.source === source;

      if (
        published &&
        draft &&
        new Date(published.createdAt).getTime() >
          new Date(draft.createdAt).getTime()
      ) {
        shouldUpdateLastDraftEntry = false;
      }

      if (shouldUpdateLastDraftEntry) {
        const { error } = await safeQuery(() =>
          db.update(schema.appPagesRevisions)
            .set({
              seo: page.seo,
              blocks: page.blocks,
              tracking: page.tracking,
              createdAt: new Date().toISOString(),
            })
            .where(eq(schema.appPagesRevisions.uid, draft?.uid as string))
        );

        if (error) {
          console.error('Error updating draft revision entry:', {
            pageId,
            revisionUid: draft?.uid,
            error,
          });
        }
      } else {
        const { error } = await safeQuery(() =>
          db.insert(schema.appPagesRevisions)
            .values({
              id: pageId,
              app: this.appId,
              blocks: page.blocks || [],
              type: 'draft',
              currentEditor: this.context?.userId,
              source,
              name: page.name || "",
              slug: page.slug || "",
              pageType: page.pageType,
              lang: page.lang || "",
              seo: page.seo,
              tracking: page.tracking,
            })
        );

        if (error) {
          console.error('Error inserting draft revision entry:', {
            pageId,
            error,
          });
        } else {
          await pruneRevisions(pageId, this.appId);
        }
      }
    } catch (error) {
      // soft-fail — revision write should never block a save
      console.error('Error adding save entry in revisions:', { pageId, error });
    }
  }

  /**
   * Update the page in the database (simple update without slug change)
   */
  private async updatePageInDatabase(pageId: string, filteredData: Partial<UpdatePageActionData>): Promise<void> {
    const changes = this.determineChangeTypes(filteredData);
    const { error, data: updatedPageData } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({
          ...filteredData,
          changes,
          lastSaved: new Date().toISOString(),
        })
        .where(and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId))).returning({
          name: schema.appPages.name,
          slug: schema.appPages.slug,
          blocks: schema.appPages.blocks,
          pageType: schema.appPages.pageType,
          lang: schema.appPages.lang,
          seo: schema.appPages.seo,
          tracking: schema.appPages.tracking,
          currentEditor: schema.appPages.currentEditor
        }),
    );

    if (error) {
      throw new ActionError("Error updating page", "ERROR_UPDATING_PAGE");
    }

    if (changes.includes("Page")) {
      const { error: error2 } = await safeQuery(() =>
        db
          .update(schema.appPages)
          .set({ changes })
          .where(and(eq(schema.appPages.primaryPage, pageId), eq(schema.appPages.app, this.appId))),
      );

      if (error2) {
        throw new ActionError("Error updating page", "ERROR_UPDATING_PAGE");
      }
    }

    // Whether a save snapshots a draft revision is a property of the site, not
    // of the caller: the builder, the MCP tools and every other UPDATE_PAGE
    // client must produce the same history.
    //
    // Both flags are required. `drafts` only narrows a feature that is already
    // on — `{ enabled: false, drafts: true }` is a disabled feature, not an
    // opt-in, and writing revisions for it would fill a table the UI never
    // shows. `getConfigFeature` returns undefined when the revisions plugin is
    // not registered (the OSS builder), which is the correct "off".
    const revisions = getConfigFeature("revisions");
    if (revisions?.enabled === true && revisions.drafts === true && updatedPageData?.[0]) {
      await this.addSaveEntryInRevision(pageId, updatedPageData[0]);
    }
  }

  /**
   * Check if only blocks are being updated
   */
  private isOnlyBlocksUpdate(filteredData: Partial<UpdatePageActionData>): boolean {
    const dataKeys = keys(filteredData);
    return dataKeys.includes("blocks");
  }

  /**
   * A language page is a secondary row pointing at its primary via primaryPage.
   */
  private async isLanguagePage(pageId: string): Promise<boolean> {
    const { data: result } = await safeQuery(() =>
      db
        .select({ primaryPage: schema.appPages.primaryPage })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, this.appId)))
        .limit(1),
    );

    return Boolean(result?.[0]?.primaryPage);
  }

  /**
   * Fetch the updated page data from database
   */
  private async fetchUpdatedPageData(pageId: string): Promise<any> {
    const { data: result, error } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          slug: schema.appPages.slug,
          lang: schema.appPages.lang,
          pageType: schema.appPages.pageType,
          name: schema.appPages.name,
          online: schema.appPages.online,
          parent: schema.appPages.parent,
          primaryPage: schema.appPages.primaryPage,
          seo: schema.appPages.seo,
        })
        .from(schema.appPages)
        .where(eq(schema.appPages.id, pageId))
        .limit(1),
    );

    if (error || !result || result.length === 0) {
      throw new ActionError("Error getting updated page", "ERROR_GETTING_PAGE");
    }

    return result[0];
  }

  private buildMutationTags(
    pageId: string,
    filteredData: Partial<UpdatePageActionData>,
    updatedPage?: { slug?: string | null; primaryPage?: string | null },
  ): string[] {
    const dataKeys = keys(filteredData);
    const hasRoutingChange = dataKeys.some((key) => ROUTING_PAGE_FIELDS.has(key));

    if (!hasRoutingChange) {
      return pageDetailsTagsForMutation(pageId);
    }

    if (this.routingSlugUpdates.length > 0) {
      return [
        ...new Set([...routingTagsForMutation(pageId, { slugUpdates: this.routingSlugUpdates }), ...this.redirectTags]),
      ];
    }

    return routingTagsForMutation(pageId, {
      slugs: updatedPage?.slug ? { new: updatedPage.slug } : undefined,
      primaryPageId: updatedPage?.primaryPage,
    });
  }

  /**
   * Build the appropriate response based on update type
   */
  private async buildResponse(
    pageId: string,
    filteredData: Partial<UpdatePageActionData>,
  ): Promise<UpdatePageActionResponse> {
    if (this.isOnlyBlocksUpdate(filteredData)) {
      return { success: true };
    }

    const updatedPage = await this.fetchUpdatedPageData(pageId);
    return { page: updatedPage, tags: this.buildMutationTags(pageId, filteredData, updatedPage) };
  }

  /**
   * Sync dynamic and dynamicSlugCustom fields to secondary pages based on primary page.
   */
  private async syncDynamicFieldsToSecondaryPages(pageId: string, filteredData: Partial<UpdatePageActionData>) {
    const dataKeys = keys(filteredData);
    const hasDynamicUpdates = dataKeys.includes("dynamic") || dataKeys.includes("dynamicSlugCustom");

    if (!hasDynamicUpdates) return;

    // 1. Sync the dynamic flags directly to secondary pages
    const syncData: any = {};
    if (dataKeys.includes("dynamic")) syncData.dynamic = filteredData.dynamic;
    if (dataKeys.includes("dynamicSlugCustom")) syncData.dynamicSlugCustom = filteredData.dynamicSlugCustom;

    const { error } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set(syncData)
        .where(and(eq(schema.appPages.primaryPage, pageId), eq(schema.appPages.app, this.appId))),
    );

    if (error) {
      console.error("Failed to sync dynamic fields to secondary pages:", error);
    }
  }

  /**
   * Handle execution errors with proper error transformation
   */
  private handleExecutionError(error: unknown): never {
    if (error instanceof ActionError) {
      throw error;
    }

    throw new ActionError(
      `Failed to update page: ${error instanceof Error ? error.message : "Unknown error"}`,
      "UPDATE_PAGE_FAILED",
    );
  }
}
