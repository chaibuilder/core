import { z } from "zod";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { getConfigPageType, toChaiPageType } from "~/server/defaults/config-registry";

export type GetDynamicPagesActionData = {
  pageType: string;
  lang: string;
  query?: string;
  /** Look up a single item by its exact identifier (id, slug, path, ...). */
  identifier?: string;
  /** @deprecated Use `identifier`. */
  slug?: string;
  /** Slug of the builder page the picker is open on. */
  pageSlug?: string;
};

type GetDynamicPagesActionResponse = any[] | { error: string };

/**
 * Get Dynamic Pages Action
 * Retrieves dynamic pages for a specific page type
 */
export class GetDynamicPagesAction extends ChaiBaseAction<GetDynamicPagesActionData, GetDynamicPagesActionResponse> {
  protected getValidationSchema() {
    return z.object({
      pageType: z.string(),
      lang: z.string(),
      query: z.string().optional(),
      identifier: z.string().optional(),
      slug: z.string().optional(),
      pageSlug: z.string().optional(),
    });
  }

  async execute(data: GetDynamicPagesActionData): Promise<GetDynamicPagesActionResponse> {
    try {
      const { pageType: pageTypeKey } = data;

      const pageTypeEntry = getConfigPageType(pageTypeKey);
      const pageType = pageTypeEntry ? toChaiPageType(pageTypeEntry) : undefined;
      if (!pageType) {
        return [];
      }

      // If the page type has a getDynamicPages function, use it
      if (pageType.getDynamicPages) {
        const result = await pageType.getDynamicPages({
          query: data.query,
          identifier: data.identifier ?? data.slug,
          slug: data.slug,
          lang: data.lang,
          pageSlug: data.pageSlug,
        });
        return result;
      }

      // If no getDynamicPages function, return empty array
      return [];
    } catch (error) {
      return this.handleError(error);
    }
  }
}
