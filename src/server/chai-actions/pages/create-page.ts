import { and, eq, inArray, isNull } from "drizzle-orm";
import { isEmpty, omit } from "lodash-es";
import { z } from "zod";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { linkedUpstreamId } from "~/server/chai-builder/public/get-upstream-full-page";
import { routingTagsForMutation } from "~/server/chai-builder/public/page-routing-cache";
import { computePartialIdsClosure } from "~/server/chai-builder/public/partial-merge-utils";
import { runChaiActionHooks } from "~/server/plugin-api/action-hooks";
import { ChaiBlock } from "~/types/common";
import { ActionError } from "../action-error";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { hasChaiPermission } from "~/server/rbac/permissions";
import { ChaiBaseAction } from "../base-action";
import { getDefaultGlobalJsonLdIds } from "./default-global-jsonlds";
import { demoteExistingHomepage, findExistingHomepage } from "./demote-existing-homepage";
import { buildPartialMetadata } from "./partial-metadata";
import { assertUpstreamPagesEnabled, findLinkableUpstream, type LinkableUpstreamPage } from "./upstream-pages";

/**
 * Data type for CreatePageAction
 */
export type CreatePageActionData = {
  name: string;
  slug: string;
  lang?: string;
  primaryPage?: string | null;
  pageType: string;
  parent?: string | null;
  dynamic?: boolean;
  hasSlug?: boolean;
  template?: string;
  dynamicSlugCustom?: string;
  seo?: Record<string, any>;
  jsonLD?: Record<string, any>;
  /** Initial tracking jsonb — the page creator sends the page type's `trackingDefault`. */
  tracking?: Record<string, any>;
  blocks?: ChaiBlock[];
  /** AI-facing description, primarily used for partials. Stored in metadata.description. */
  description?: string;
  /** Free-form, site-specific tags for partials/global blocks. Stored under the namespaced metadata key `__tags` (PARTIAL_TAGS_METADATA_KEY). */
  tags?: string[];
  /** Create a linked page that renders this upstream page (features.upstreamPages). */
  upstream?: string;
};

type CreatePageActionResponse = {
  page: {
    id: string;
    name: string;
    slug: string;
    lang: string;
    pageType: string;
    parent: string | null;
    online: boolean | null;
  };
  tags: string[];
};

/**
 * Action to create a new page
 */
export class CreatePageAction extends ChaiBaseAction<CreatePageActionData, CreatePageActionResponse> {
  /**
   * Define the validation schema for create page action
   */
  protected getValidationSchema() {
    return z
      .object({
        name: z.string().min(1),
        // A stored `{{…}}` segment makes every dynamic URL under the slug 404:
        // slugs are base paths, URL segments are appended at render.
        slug: z.string().refine((slug) => !/[{}]/.test(slug), "must be a base path without {{…}} template segments"),
        pageType: z.string(),
        parent: z.string().nullable().optional(),
        lang: z.string().optional(),
        primaryPage: z.string().nullable().optional(),
        dynamic: z.boolean().optional(),
        hasSlug: z.boolean().optional(),
        template: z.string().optional(),
        seo: z.record(z.string(), z.any()).optional(),
        jsonLD: z.record(z.string(), z.any()).optional(),
        tracking: z.record(z.string(), z.any()).optional(),
        dynamicSlugCustom: z.string().optional(),
        blocks: z.array(z.any()).optional(),
        description: z.string().optional(),
        tags: z.array(z.string().min(1).max(50)).optional(),
        upstream: z.string().uuid().optional(),
      })
      .refine(
        (data) => {
          if (data.lang && data.lang !== "") {
            return !!data.primaryPage;
          }
          return true;
        },
        {
          message: "primaryPage is required when lang option is not empty",
          path: ["primaryPage"],
        },
      );
  }

  /**
   * Execute the create page action
   */
  async execute(input: CreatePageActionData): Promise<CreatePageActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
    const { appId, userId } = this.context;

    // A linked page takes its type and dynamic settings from the upstream page and starts with no
    // content of its own.
    const upstream = input.upstream ? await this.resolveUpstream(input) : null;
    const data = upstream
      ? {
          ...input,
          pageType: upstream.pageType ?? "page",
          dynamic: upstream.dynamic ?? false,
          // As from scratch: the user may add a custom part after the type's dynamic pattern.
          dynamicSlugCustom: upstream.dynamic ? (input.dynamicSlugCustom ?? "") : "",
          blocks: [],
        }
      : input;

    // Partial page types (global, _layout, …) never get a slug — even if the client sends one
    const hasSlug = data.hasSlug ?? (data.pageType === "global" || data.pageType === "_layout" ? false : true);
    const slug = hasSlug ? data.slug : "";

    // A folder exists only to claim a URL segment — an empty or root slug claims nothing
    if (data.pageType === "_folder" && (!slug || slug === "/")) {
      throw new ActionError("Folder requires a slug", "FOLDER_SLUG_REQUIRED");
    }

    // Only a root-level primary page of the built-in "page" type can own the
    // root path. Non-nullish check, not truthiness: the schema accepts "" for
    // the relationship ids, and letting "" through would demote the current
    // homepage before the insert fails on the invalid foreign key.
    const isHomepageClaim = hasSlug && slug === "/";
    if (isHomepageClaim && (data.pageType !== "page" || data.parent != null || data.primaryPage != null)) {
      throw new ActionError("Only a root-level page of type 'page' can be the homepage", "INVALID_HOMEPAGE_PAGE_TYPE");
    }

    // Validate slug uniqueness if hasSlug is true. A homepage claim skips this:
    // whatever currently owns "/" is demoted just before the insert instead.
    if (hasSlug && slug && !isHomepageClaim) {
      const slugExists = await this.doesSlugExist(slug, data.pageType, data.dynamic ?? false);
      if (slugExists) {
        throw new ActionError("Slug already exists", "SLUG_ALREADY_USED");
      }
    }

    let blocks: ChaiBlock[] = data.blocks ?? [];

    // If using a template, get the blocks from the template
    if (data.template) {
      blocks = await this.getTemplateBlocks(data.template, appId);
    }

    let dynamic = data.dynamic ?? false;
    let dynamicSlugCustom = data.dynamicSlugCustom ?? "";

    if (data.primaryPage) {
      const { data: primaryPageData } = await safeQuery(() =>
        db.query.appPages.findFirst({
          where: and(eq(schema.appPages.id, data.primaryPage as string), eq(schema.appPages.app, appId)),
          columns: {
            dynamic: true,
            dynamicSlugCustom: true,
            upstream: true,
            useUpstream: true,
          },
        }),
      );
      // A language page of a linked page would render its own empty blocks, not the upstream page's.
      if (primaryPageData && linkedUpstreamId(primaryPageData)) {
        throw new ActionError(
          "A linked page can't have language pages until it is duplicated",
          "UPSTREAM_PAGE_LINKED",
          409,
        );
      }
      if (primaryPageData) {
        dynamic = primaryPageData.dynamic ?? false;
        dynamicSlugCustom = primaryPageData.dynamicSlugCustom ?? "";
      }
    }

    // A dynamic folder would resolve through the dynamic-candidate path and render at
    // its own URL, defeating the 404 the static exclusion guarantees. The UI never
    // offers the combination, but this action is reachable directly.
    //
    // Checked here rather than against `data.dynamic`, because a folder naming a
    // dynamic `primaryPage` inherits `dynamic` above — a payload that looks harmless
    // on arrival and is dynamic by the time it is written.
    if (data.pageType === "_folder" && dynamic) {
      throw new ActionError("Folder cannot be dynamic", "FOLDER_CANNOT_BE_DYNAMIC");
    }

    // Index the partial ids used by the initial blocks (templates and
    // make-partial flows can create pages that already reference partials)
    let partialBlocks = "";
    if (blocks.length > 0) {
      try {
        partialBlocks = (await computePartialIdsClosure(blocks, appId)).join("|");
      } catch (error) {
        console.error("Failed to compute partial ids closure for new page:", error);
      }
    }

    // Shared JSON-LD schemas flagged "enabled by default for new pages" are attached
    // here (CREATE_PAGE) and by the two importers; DUPLICATE_PAGE and the clone
    // service copy the source page's existing list instead, so they skip this.
    const defaultGlobalJsonLds = await this.resolveDefaultGlobalJsonLds(appId, data, hasSlug && !!slug);

    // Prepare the page data
    const pageData = {
      app: appId,
      name: data.name,
      slug: slug,
      pageType: data.pageType,
      parent: data.parent ?? null,
      lang: !data.primaryPage ? "" : (data.lang ?? ""),
      primaryPage: data.primaryPage ?? null,
      dynamic: dynamic,
      dynamicSlugCustom: dynamicSlugCustom,
      blocks: blocks,
      partialBlocks,
      seo: data.seo ?? {
        title: data.name,
        jsonLD: "",
        noIndex: false,
        ogImage: "",
        ogTitle: "",
        noFollow: "",
        description: "",
        searchTitle: "",
        cononicalUrl: "",
        ogDescription: "",
        searchDescription: "",
      },
      jsonld: {},
      tracking: data.tracking ?? {},
      globalJsonLds: defaultGlobalJsonLds,
      metadata: buildPartialMetadata(data.description, data.tags),
      online: false,
      currentEditor: null,
      changes: null,
      libRefId: null,
      lastSaved: null,
      createdBy: userId,
      ...(upstream ? { upstream: upstream.id, useUpstream: true } : {}),
    };

    // Demote as late as possible — every fallible preparation step is done, so a
    // failure after this point is limited to the insert itself. (The db layer has
    // no cross-dialect transactions, so demotion + insert cannot be atomic.)
    let demotedHomepageTags: string[] = [];
    if (isHomepageClaim && (await findExistingHomepage(appId))) {
      // Demotion rewrites and unpublishes the current homepage — a page this
      // create-gated action never named — so it needs those permissions too.
      const permissions = this.context.userAccess?.permissions ?? null;
      if (
        !hasChaiPermission(permissions, CHAI_PERMISSIONS["pages:update"]) ||
        !hasChaiPermission(permissions, CHAI_PERMISSIONS["pages:unpublish"])
      ) {
        throw new ActionError(
          `Replacing the current homepage requires permissions: ${CHAI_PERMISSIONS["pages:update"]}, ${CHAI_PERMISSIONS["pages:unpublish"]}`,
          "FORBIDDEN",
          403,
        );
      }
      demotedHomepageTags = await demoteExistingHomepage(appId);
    }

    // Insert the new page using safeQuery
    const { data: result, error } = await safeQuery(() => db.insert(schema.appPages).values(pageData).returning());

    if (error) {
      throw new ActionError("Failed to create page", "ERROR_CREATING_PAGE", 500, error);
    }

    if (!result || result.length === 0) {
      throw new ActionError("Failed to create page", "INSERT_FAILED");
    }

    const newPage = result[0]!;

    // A real page now owns this path. Subscribers (the redirects plugin) tidy up anything
    // that used to answer for it and return the cache tags that must be busted.
    // Slugless pages can never shadow anything, so the app's lookups stay cached.
    // Folders never answer their path (direct visits 404), so they claim nothing either.
    const pathClaimedTags =
      newPage.slug && newPage.pageType !== "_folder"
        ? await runChaiActionHooks("page:path-claimed", { appId: this.context!.appId, slug: newPage.slug })
        : [];

    // Return the page data, omitting primaryPage if it exists
    return {
      page: omit(newPage.primaryPage ? { ...newPage, id: newPage.primaryPage } : newPage, [
        "primaryPage",
      ]) as CreatePageActionResponse["page"],
      tags: [
        ...routingTagsForMutation(newPage.id, {
          slugs: newPage.slug ? { new: newPage.slug } : undefined,
          primaryPageId: newPage.primaryPage,
        }),
        ...pathClaimedTags,
        ...demotedHomepageTags,
      ],
    };
  }

  /**
   * The upstream page a linked create points at. The host's upstream page source decides, so an id
   * this user may not link into this app is not found.
   */
  private async resolveUpstream(data: CreatePageActionData): Promise<LinkableUpstreamPage> {
    assertUpstreamPagesEnabled();
    if (data.primaryPage || data.lang || data.template || data.hasSlug === false) {
      throw new ActionError("A linked page must be a routable primary page", "INVALID_UPSTREAM_PAGE", 400);
    }
    if (!data.slug?.trim()) throw new ActionError("A linked page needs a slug", "INVALID_UPSTREAM_PAGE", 400);
    const upstream = await findLinkableUpstream({
      appId: this.context!.appId,
      userId: this.context!.userId,
      upstreamId: data.upstream!,
    });
    if (!upstream) throw new ActionError("Upstream page not found", "UPSTREAM_PAGE_NOT_FOUND", 404);
    // A dynamic page answers under its parent's path, so it cannot sit at the root.
    if (upstream.dynamic && !data.parent) {
      throw new ActionError("A dynamic linked page needs a parent page", "INVALID_UPSTREAM_PAGE", 400);
    }
    return upstream;
  }

  /**
   * Shared JSON-LD ids to seed onto the new page, or `[]` when it is not a page
   * that renders its own `<head>`: a language variant (inherits the primary's
   * list at render time), a slugless page (merged into a host page's `<head>`),
   * or a folder (never renders).
   */
  private async resolveDefaultGlobalJsonLds(
    appId: string,
    data: CreatePageActionData,
    hasRoutableSlug: boolean,
  ): Promise<string[]> {
    if (data.primaryPage || !hasRoutableSlug || data.pageType === "_folder") return [];
    return getDefaultGlobalJsonLdIds(appId);
  }

  /**
   * Check if slug already exists for the given page type.
   * Folders share the URL space with every type: a folder's slug conflicts with
   * any existing page, and any page's slug conflicts with an existing folder —
   * except a dynamic page, whose slug is its parent's path (`/listing` for
   * `/listing/{{slug}}`) and so always sits on the folder that holds it.
   */
  private async doesSlugExist(slug: string, pageType: string, dynamic: boolean): Promise<boolean> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
    const { appId } = this.context;

    const pageTypeCondition =
      pageType === "_folder"
        ? undefined
        : inArray(schema.appPages.pageType, dynamic ? [pageType] : [pageType, "_folder"]);

    const { data: existingPage, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(
          eq(schema.appPages.slug, slug),
          pageTypeCondition,
          eq(schema.appPages.app, appId),
          isNull(schema.appPages.deletedAt),
        ),
        columns: {
          id: true,
        },
      }),
    );

    if (error) {
      throw new ActionError(`${error.message}`, "SLUG_CHECK_FAILED");
    }

    return !!existingPage;
  }

  /**
   * Get blocks from a template and handle partial blocks from external libraries
   */
  private async getTemplateBlocks(templateId: string, appId: string): Promise<ChaiBlock[]> {
    // Fetch template with library information using JOIN
    const { data: result, error: templateError } = await safeQuery(() =>
      db
        .select({
          template: schema.libraryTemplates,
          library: {
            id: schema.libraries.id,
            app: schema.libraries.app,
            name: schema.libraries.name,
          },
        })
        .from(schema.libraryTemplates)
        .leftJoin(schema.libraries, eq(schema.libraryTemplates.library, schema.libraries.id))
        .where(and(eq(schema.libraryTemplates.id, templateId), isNull(schema.libraryTemplates.deletedAt)))
        .limit(1)
        .then((rows) => rows[0]),
    );

    if (templateError) {
      throw new ActionError(
        `Failed to fetch template: ${templateError.message || "Unknown database error"}`,
        "ERROR_GETTING_TEMPLATE_BLOCKS",
        500,
        templateError,
      );
    }

    if (!result || !result.template || !result.library) {
      throw new ActionError(`Template not found with ID: ${templateId}`, "TEMPLATE_NOT_FOUND");
    }

    const template = result.template as typeof schema.libraryTemplates.$inferSelect;
    const library = result.library as typeof schema.libraries.$inferSelect;

    // Fetch template blocks
    const { data: templatePage, error: templateBlocksError } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: eq(schema.appPages.id, template.pageId as string),
        columns: {
          blocks: true,
        },
      }),
    );

    if (templateBlocksError) {
      throw new ActionError(
        `Failed to fetch template blocks: ${templateBlocksError.message || "Unknown database error"}`,
        "ERROR_GETTING_TEMPLATE_BLOCKS",
        500,
        templateBlocksError,
      );
    }

    if (!templatePage) {
      throw new ActionError(`Template page not found with ID: ${template.pageId}`, "TEMPLATE_PAGE_NOT_FOUND");
    }

    let blocks: ChaiBlock[] = (templatePage.blocks as ChaiBlock[]) || [];

    // Convert GlobalBlock to PartialBlock
    blocks = blocks.map((block) => {
      if (block._type === "GlobalBlock" && !isEmpty(block.globalBlock)) {
        return {
          ...block,
          _type: "PartialBlock",
          partialBlockId: block.globalBlock,
        };
      }
      return block;
    });

    const isSiteLibrary = library.app === appId;

    // If template is from an external library, copy partial blocks
    if (!isSiteLibrary) {
      const libraryName = library.name || "";

      // Find all partial blocks
      const partialBlocks = blocks.filter((block) => block._type === "PartialBlock" && !isEmpty(block.partialBlockId));

      // Copy each partial block from the external library
      const newPages = await Promise.all(
        partialBlocks.map(({ partialBlockId }) =>
          this.copyPartialBlockFromTemplate(partialBlockId!, libraryName, appId),
        ),
      );

      // Update the partial blocks with the new page IDs
      blocks = blocks.map((block) => {
        const newPage = newPages.find((page) => page?.libRefId === block.partialBlockId);
        if (newPage) {
          block._name = `${libraryName} - ${block._name}`;
          block.partialBlockId = newPage.id;
        }
        return block;
      });
    }

    return blocks;
  }

  /**
   * Copy a partial block from a template library
   */
  private async copyPartialBlockFromTemplate(
    partialBlockId: string,
    libraryName: string,
    appId: string,
  ): Promise<{ id: string; libRefId: string } | null> {
    // Fetch the original partial block page
    const { data: originalPage, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: eq(schema.appPages.id, partialBlockId),
      }),
    );

    if (error || !originalPage) {
      console.error("Failed to fetch partial block:", error);
      return null;
    }

    // Create a new page with the partial block content
    const newPageData = {
      ...originalPage,
      id: undefined, // Let database generate new ID
      app: appId,
      libRefId: partialBlockId,
      name: `${libraryName} - ${originalPage.name}`,
      createdAt: undefined,
      online: false,
      currentEditor: null,
      changes: null,
      lastSaved: null,
      createdBy: this.context?.userId,
    };

    const { data: newPage, error: insertError } = await safeQuery(() =>
      db.insert(schema.appPages).values(newPageData).returning(),
    );

    if (insertError || !newPage || newPage.length === 0) {
      console.error("Failed to create partial block copy:", insertError);
      return null;
    }

    const createdPage = newPage[0]!;

    return {
      id: createdPage.id,
      libRefId: createdPage.libRefId || partialBlockId,
    };
  }
}
