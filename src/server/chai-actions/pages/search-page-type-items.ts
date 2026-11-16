import { z } from "zod";
import { getConfigPageType, toChaiPageType } from "~/server/defaults/config-registry";
import { ChaiBaseAction } from "../base-action";

export type SearchPageTypeItemsActionData = {
  pageType: string;
  query: string;
};

type SearchPageTypeItemsActionResponse = any[] | { error: string };

/**
 * Search Page Type Items Action
 * Searches for items within a specific page type using its search function
 */
export class SearchPageTypeItemsAction extends ChaiBaseAction<
  SearchPageTypeItemsActionData,
  SearchPageTypeItemsActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      pageType: z.string(),
      query: z.string(),
    });
  }

  async execute(data: SearchPageTypeItemsActionData): Promise<SearchPageTypeItemsActionResponse> {
    try {
      const { pageType: pageTypeKey, query } = data;

      const pageTypeEntry = getConfigPageType(pageTypeKey);
      const pageType = pageTypeEntry ? toChaiPageType(pageTypeEntry) : undefined;
      if (!pageType) {
        return { error: "Page type not found" };
      }

      // If the page type has a search function, use it
      if (pageType.search) {
        const result = await pageType.search(query);
        // Handle both array and error responses
        if (result instanceof Error) {
          return { error: result.message };
        }
        return result;
      }

      // If no search function, return empty array
      // Note: In the original code, it falls back to backend.handleHttpAction
      // but for the action pattern, we return empty or throw an error
      return [];
    } catch (error) {
      return this.handleError(error);
    }
  }
}
