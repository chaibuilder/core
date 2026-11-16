import { z } from "zod";
import { fetchConfigGlobalData } from "~/server/defaults/config-registry";
import { ChaiBaseAction } from "../base-action";

export type GetSiteGlobalDataActionData = {
  lang: string;
};

type GetSiteGlobalDataActionResponse = Record<string, unknown>;

/**
 * Get Site Global Data Action
 * Fetches site-wide global data (from globalDataProvider) independently of any page.
 * This data is the same for all pages and can be cached once per session in the builder.
 */
export class GetSiteGlobalDataAction extends ChaiBaseAction<
  GetSiteGlobalDataActionData,
  GetSiteGlobalDataActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      lang: z.string(),
    });
  }

  async execute(data: GetSiteGlobalDataActionData): Promise<GetSiteGlobalDataActionResponse> {
    try {
      const { lang } = data;
      return await fetchConfigGlobalData({ lang, draft: true, inBuilder: true });
    } catch (error) {
      return this.handleError(error);
    }
  }
}
