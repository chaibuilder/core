import { z } from "zod";
import { consumeProviderTags } from "~/server/chai-builder/public/register-cache-tags";
import { getConfigPageType, toChaiPageType } from "~/server/defaults/config-registry";
import { ChaiPageType } from "~/types/actions";
import { ChaiBaseAction } from "../base-action";

export type GetBuilderPageDataActionData = {
  lang: string;
  pageType?: string;
  pageProps?: any;
};

type GetBuilderPageDataActionResponse = Record<string, any>;

/**
 * Get Builder Page Data Action
 * Fetches page-type-specific data for the builder.
 * Site-wide global data is handled separately by GetSiteGlobalDataAction.
 */
export class GetBuilderPageDataAction extends ChaiBaseAction<
  GetBuilderPageDataActionData,
  GetBuilderPageDataActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      lang: z.string(),
      pageType: z.string().optional(),
      pageProps: z.any().optional().default({}),
    });
  }

  async execute(data: GetBuilderPageDataActionData): Promise<GetBuilderPageDataActionResponse> {
    try {
      const { lang, pageType: pageTypeKey, pageProps = {} } = data;

      if (!pageTypeKey) {
        return {};
      }

      const pageTypeEntry = getConfigPageType(pageTypeKey);
      const pageType: ChaiPageType | undefined = pageTypeEntry ? toChaiPageType(pageTypeEntry) : undefined;
      if (!pageType) {
        return {};
      }

      if (!pageType.dataProvider) {
        return {};
      }

      const result = await pageType.dataProvider({
        lang,
        draft: true,
        inBuilder: true,
        pageProps: pageProps as any,
      });

      // Builder context: strip $cacheTags without registering.
      return result ? await consumeProviderTags(result, false) : {};
    } catch (error) {
      return this.handleError(error);
    }
  }
}
