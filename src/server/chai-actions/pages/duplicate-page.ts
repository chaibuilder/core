import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ActionError } from "~/server/chai-actions/action-error";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { db, type ChaiDbInstance, getChaiDbDialect, safeQuery, schema } from "~/server/chai-actions/db";
import { routingTagsForMutation } from "~/server/chai-builder/public/page-routing-cache";

/**
 * Data type for DuplicatePageAction
 */
export type DuplicatePageVariant = { pageId: string; name: string; slug: string };

export type DuplicatePageActionData = {
  pageId: string;
  name: string;
  slug?: string;
  variants?: DuplicatePageVariant[];
};

export type DuplicatePageActionResponse = {
  id: string;
  tags: string[];
};

/**
 * Action to duplicate a page
 */
export class DuplicatePageAction extends ChaiBaseAction<DuplicatePageActionData, DuplicatePageActionResponse> {
  /**
   * Define the validation schema for duplicate page action
   */
  protected getValidationSchema() {
    return z.object({
      pageId: z.string().nonempty(),
      name: z.string().nonempty(),
      slug: z.string().optional(),
      variants: z
        .array(z.object({ pageId: z.string().nonempty(), name: z.string().nonempty(), slug: z.string().nonempty() }))
        .refine((variants) => new Set(variants.map((variant) => variant.pageId)).size === variants.length, {
          message: "Duplicate variant",
        })
        .optional(),
    });
  }

  /**
   * Execute the duplicate page action
   */
  async execute(data: DuplicatePageActionData): Promise<DuplicatePageActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
    const { appId, userId } = this.context;

    const { data: originalPage, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(
          eq(schema.appPages.id, data.pageId),
          eq(schema.appPages.app, appId),
          isNull(schema.appPages.deletedAt),
        ),
      }),
    );

    if (error) {
      throw error;
    }

    // Validate original page exists
    if (!originalPage) {
      throw new ActionError("Page not found", "PAGE_NOT_FOUND");
    }

    const variants = await this.loadVariants(data, appId);

    // Every chosen slug is checked before the first write, so a clash creates nothing
    const slugs = [data.slug, ...variants.map((variant) => variant.slug)].filter((slug): slug is string => !!slug);
    const repeated = slugs.find((slug, index) => slugs.indexOf(slug) !== index);
    if (repeated) {
      throw this.slugExists(repeated);
    }
    const taken = await this.findTakenSlug(slugs, appId);
    if (taken) {
      throw this.slugExists(taken);
    }

    const created = await this.insertCopies(originalPage, variants, data, userId);

    return {
      id: created.primary.id,
      tags: routingTagsForMutation(created.primary.id, {
        slugs: data.slug ? { new: data.slug } : undefined,
        slugUpdates: created.copies.map((copy) => ({ id: copy.id, newSlug: copy.slug })),
      }),
    };
  }

  private async insertCopies(
    originalPage: typeof schema.appPages.$inferSelect,
    variants: { page: typeof schema.appPages.$inferSelect; name: string; slug: string }[],
    data: DuplicatePageActionData,
    userId: string | undefined,
  ) {
    const copyOf = (page: typeof originalPage) => ({
      ...page,
      id: undefined,
      createdAt: undefined,
      currentEditor: null,
      changes: null,
      online: false,
      libRefId: null,
      lastSaved: null,
      createdBy: userId,
    });

    const writes = async (q: ChaiDbInstance) => {
      const [primary] = await q
        .insert(schema.appPages)
        .values({ ...copyOf(originalPage), name: data.name, ...(data.slug && { slug: data.slug }) })
        .returning();
      if (!primary) {
        throw new ActionError("Failed to create duplicate page", "INSERT_FAILED");
      }
      const copies =
        variants.length === 0
          ? []
          : await q
              .insert(schema.appPages)
              .values(
                variants.map(({ page, name, slug }) => ({
                  ...copyOf(page),
                  name,
                  slug,
                  primaryPage: primary.id,
                })),
              )
              .returning({ id: schema.appPages.id, slug: schema.appPages.slug });
      return { primary, copies };
    };

    const { data: created, error } = await safeQuery(() =>
      getChaiDbDialect() === "pg" ? db.transaction((tx) => writes(tx as unknown as ChaiDbInstance)) : writes(db),
    );
    if (error) {
      throw error instanceof ActionError
        ? error
        : new ActionError("Failed to create duplicate page", "INSERT_FAILED", 500, error);
    }
    return created;
  }

  private async loadVariants(data: DuplicatePageActionData, appId: string) {
    const variants = data.variants;
    if (!variants?.length) return [];
    const { data: rows, error } = await safeQuery(() =>
      db.query.appPages.findMany({
        where: and(
          inArray(
            schema.appPages.id,
            variants.map((variant) => variant.pageId),
          ),
          eq(schema.appPages.primaryPage, data.pageId),
          eq(schema.appPages.app, appId),
          isNull(schema.appPages.deletedAt),
        ),
      }),
    );
    if (error) {
      throw error;
    }
    return variants.map(({ pageId, name, slug }) => {
      const page = rows.find((row) => row.id === pageId);
      if (!page) {
        throw new ActionError("Page not found", "PAGE_NOT_FOUND");
      }
      if (!slug.startsWith(`/${page.lang}/`)) {
        throw new ActionError(`Slug must start with /${page.lang}/: ${slug}`, "INVALID_SLUG", 400, undefined, { slug });
      }
      return { page, name, slug };
    });
  }

  private slugExists(slug: string) {
    return new ActionError(`Slug already exists: ${slug}`, "SLUG_EXISTS", 400, undefined, { slug });
  }

  private async findTakenSlug(slugs: string[], appId: string): Promise<string | undefined> {
    if (slugs.length === 0) return undefined;
    const { data: existingPage, error } = await safeQuery(() =>
      db.query.appPages.findFirst({
        where: and(
          inArray(schema.appPages.slug, slugs),
          eq(schema.appPages.app, appId),
          isNull(schema.appPages.deletedAt),
        ),
        columns: {
          slug: true,
        },
      }),
    );

    if (error) {
      throw new ActionError(`${error.message}`, "SLUG_CHECK_FAILED");
    }
    return existingPage?.slug;
  }
}
