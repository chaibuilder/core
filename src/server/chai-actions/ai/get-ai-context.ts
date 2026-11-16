import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAppFields } from "~/server/chai-actions/apps/app-store";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";

type GetAiContextActionData = { pageId?: string };

type GetAiContextActionResponse = {
  success: boolean;
  aiData: {
    app: any;
    page: any;
  };
};

export class GetAiContextAction extends ChaiBaseAction<GetAiContextActionData, GetAiContextActionResponse> {
  protected getValidationSchema() {
    return z.object({
      pageId: z.string().optional(),
    });
  }

  async execute(data: GetAiContextActionData): Promise<GetAiContextActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    const { appId } = this.context;

    // 1. Get App level AI context
    const { data: appData, error: appError } = await getAppFields(appId, ["ai"]);

    if (appError) {
      console.error("Error fetching app AI context:", appError);
    }

    // 2. Get Page level AI context if pageId is provided
    let pageAi: any = null;
    if (data.pageId) {
      const { data: pageData, error: pageError } = await safeQuery(() =>
        db.query.appPages.findFirst({
          where: and(eq(schema.appPages.id, data.pageId as string), eq(schema.appPages.app, appId)),
          columns: { ai: true },
        }),
      );

      if (pageError) {
        throw new ActionError("Error fetching page AI context", "PAGE_AI_CONTEXT_ERROR", 500, pageError);
      }

      if (!pageData) {
        throw new ActionError("Page not found for this app", "PAGE_NOT_FOUND", 404);
      }
      pageAi = pageData.ai;
    }

    return {
      success: true,
      aiData: {
        app: appData?.ai || {},
        page: pageAi || {},
      },
    };
  }
}
