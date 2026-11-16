import { z } from "zod";
import { getConfigPageType, toChaiPageType } from "~/server/defaults/config-registry";
import { ChaiBaseAction } from "../base-action";
import { GetBuilderPageDataAction } from "./get-builder-page-data";
import { GetDraftPageAction } from "./get-draft-page";
import { GetLanguagePagesAction } from "./get-language-pages";
import { GetSiteGlobalDataAction } from "./get-site-global-data";

export type GetPageAllDataActionData = {
  id: string;
  lang: string;
  pageType?: string;
  pageProps?: any;
};

type GetPageAllDataActionResponse = {
  draftPage: any;
  builderPageData: any;
  languagePages: any[];
  siteGlobalData: Record<string, unknown>;
  /** Message from a data provider that threw. The rest of the payload is still usable. */
  builderPageDataError?: string;
  /**
   * Whether the requested dynamic identifier resolved to any data. Only set for
   * dynamic pages that asked for a specific identifier; `undefined` otherwise.
   */
  dynamicDataFound?: boolean;
};

/**
 * Get Page All Data Action
 * Consolidates GET_DRAFT_PAGE, GET_BUILDER_PAGE_DATA, GET_SITE_GLOBAL_DATA,
 * and GET_LANGUAGE_PAGES into a single API call.
 * This reduces the number of HTTP requests and improves page load performance.
 */
export class GetPageAllDataAction extends ChaiBaseAction<GetPageAllDataActionData, GetPageAllDataActionResponse> {
  protected getValidationSchema() {
    return z.object({
      id: z.string(),
      lang: z.string(),
      pageType: z.string().optional(),
      pageProps: z.any().optional().default({}),
    });
  }

  async execute(data: GetPageAllDataActionData): Promise<GetPageAllDataActionResponse> {
    const { id, lang, pageType, pageProps = {} } = data;

    const draftPageAction = new GetDraftPageAction();
    const builderPageDataAction = new GetBuilderPageDataAction();
    const languagePagesAction = new GetLanguagePagesAction();
    const siteGlobalDataAction = new GetSiteGlobalDataAction();

    if (this.context) {
      draftPageAction.setContext(this.context);
      builderPageDataAction.setContext(this.context);
      languagePagesAction.setContext(this.context);
      siteGlobalDataAction.setContext(this.context);
    }

    // A dynamic page can be opened with an identifier the user typed, so the data
    // provider may legitimately fail or find nothing. Neither should cost the
    // builder its draft blocks, which is what a rejection here used to do.
    const builderPageDataResult = builderPageDataAction
      .execute({ lang, pageType, pageProps })
      .then((data) => ({ data: data ?? {}, error: undefined as string | undefined }))
      .catch((error) => {
        console.error("[GetPageAllDataAction] GetBuilderPageDataAction failed:", error);
        return {
          data: {} as Record<string, any>,
          error: error instanceof Error ? error.message : String(error),
        };
      });

    const [draftPage, builderPageData, languagePages, siteGlobalData] = await Promise.all([
      draftPageAction.execute({ id }),
      builderPageDataResult,
      languagePagesAction.execute({ id }),
      siteGlobalDataAction.execute({ lang }),
    ]);

    return {
      draftPage,
      builderPageData: builderPageData.data,
      languagePages,
      siteGlobalData,
      ...(builderPageData.error ? { builderPageDataError: builderPageData.error } : {}),
      ...this.resolveDynamicDataFound(pageType, pageProps, builderPageData.data),
    };
  }

  /**
   * Page types without a data provider have nothing to miss, so they always count as
   * found — otherwise an empty result means the identifier matched no content.
   */
  private resolveDynamicDataFound(
    pageTypeKey: string | undefined,
    pageProps: any,
    builderPageData: Record<string, any>,
  ): { dynamicDataFound?: boolean } {
    if (!pageProps?.dynamic || !pageProps?.pageIdentifier) return {};

    const pageTypeEntry = pageTypeKey ? getConfigPageType(pageTypeKey) : undefined;
    const pageType = pageTypeEntry ? toChaiPageType(pageTypeEntry) : undefined;
    if (!pageType?.dataProvider) return { dynamicDataFound: true };

    return { dynamicDataFound: Object.keys(builderPageData).length > 0 };
  }
}
