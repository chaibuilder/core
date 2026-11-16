import { and, eq, inArray, isNull } from "drizzle-orm";
import { isEmpty } from "lodash-es";
import { z } from "zod";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { apiError } from "~/server/chai-actions/lib";
import { ChaiBaseAction } from "../base-action";

export type GetWebsitePagesActionData = {
  lang?: string;
};

type GetWebsitePagesActionResponse = Array<{
  id: string;
  name: string;
  slug: string;
  pageType: string;
  currentEditor?: string | null;
  parent?: string | null;
  online: boolean | null;
  lastSaved?: string | null;
  createdAt: string;
  dynamic: boolean | null;
  dynamicSlugCustom: string | null;
  primaryPage?: string | null;
  isTemplate: boolean;
  changes: string[] | null;
  lang: string;
  designTokens: unknown;
  links: string | null;
  partialBlocks: string | null;
  metadata: Record<string, unknown> | null;
  /** The page this one renders while `useUpstream` is on (upstream pages). */
  upstream: string | null;
  useUpstream: boolean;
}>;

export class GetWebsitePagesAction extends ChaiBaseAction<GetWebsitePagesActionData, GetWebsitePagesActionResponse> {
  protected getValidationSchema() {
    return z.object({
      lang: z.string().optional(),
    });
  }

  async execute(data: GetWebsitePagesActionData): Promise<GetWebsitePagesActionResponse> {
    if (!this.context) {
      throw apiError("CONTEXT_NOT_SET", new Error("CONTEXT_NOT_SET"));
    }

    const { appId } = this.context;
    const requestData = data ?? { lang: "" };
    const lang = requestData.lang ?? "";

    // First, get all pages for the app and language
    const { data: pages, error } = await safeQuery(() =>
      db
        .select({
          id: schema.appPages.id,
          name: schema.appPages.name,
          slug: schema.appPages.slug,
          pageType: schema.appPages.pageType,
          currentEditor: schema.appPages.currentEditor,
          parent: schema.appPages.parent,
          online: schema.appPages.online,
          lastSaved: schema.appPages.lastSaved,
          createdAt: schema.appPages.createdAt,
          dynamic: schema.appPages.dynamic,
          dynamicSlugCustom: schema.appPages.dynamicSlugCustom,
          primaryPage: schema.appPages.primaryPage,
          changes: schema.appPages.changes,
          lang: schema.appPages.lang,
          designTokens: schema.appPages.designTokens,
          links: schema.appPages.links,
          partialBlocks: schema.appPages.partialBlocks,
          metadata: schema.appPages.metadata,
          upstream: schema.appPages.upstream,
          useUpstream: schema.appPages.useUpstream,
        })
        .from(schema.appPages)
        .where(and(eq(schema.appPages.app, appId), eq(schema.appPages.lang, lang), isNull(schema.appPages.deletedAt))),
    );

    if (error) {
      throw apiError("ERROR_GETTING_WEBSITE_PAGES", error);
    }

    if (!pages || pages.length === 0) {
      return [];
    }

    // Get template information for all pages with slugs in a single query
    const pageIdsWithSlugs = pages.filter((page) => !isEmpty(page.slug)).map((page) => page.id);

    const { data: templates, error: templatesError } = await safeQuery(() =>
      db
        .select({
          pageId: schema.libraryTemplates.pageId,
        })
        .from(schema.libraryTemplates)
        .where(
          and(inArray(schema.libraryTemplates.pageId, pageIdsWithSlugs), isNull(schema.libraryTemplates.deletedAt)),
        ),
    );

    if (templatesError) {
      throw apiError("ERROR_GETTING_TEMPLATE_INFO", templatesError);
    }

    // Create a set of pageIds that are templates for O(1) lookup
    const templatePageIds = new Set((templates || []).map((t) => t.pageId));

    // Map the pages with template information
    return pages.map((page) => ({
      ...page,
      pageType: page.pageType ?? "page",
      isTemplate: templatePageIds.has(page.id),
      changes: page.changes as string[] | null,
      lang: page.lang,
      designTokens: page.designTokens,
      links: page.links,
      partialBlocks: page.partialBlocks,
      metadata: (page.metadata as Record<string, unknown> | null) ?? null,
    }));
  }
}
