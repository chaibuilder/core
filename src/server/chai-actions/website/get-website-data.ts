import { z } from "zod";
import { getConfigAI, getConfigMediaManager, getConfigFeatures } from "~/server/defaults/config-registry";
import { serializeAIConfigForClient, type SerializedAIConfig } from "~/server/defaults/serialize-ai-config";
import type { ChaiMediaManagerConfig, ChaiServerFeatures } from "~/types/server-config";
import { getChaiActionInstance } from "../actions-registery";
import { ChaiBaseAction } from "../base-action";
import { GetCollectionsAction } from "../collections/get-collections";
import { GetRepeaterDataAction } from "../repeater-data/get-repeater-data";
import { GetPageTypesAction } from "../pages/get-page-types";
import { GetWebsitePagesAction } from "../pages/get-website-pages";
import { GetWebsiteSettingsAction } from "./get-website-settings";

export type GetWebsiteDataActionData = Record<string, never>;

export type GetWebsiteDataActionResponse = {
  websiteSettings: any;
  websitePages: any;
  pageTypes: any;
  libraries: any;
  collections: any;
  repeaterData: any;
  /** Server-config switches the builder UI needs in order to hide what the server won't serve. */
  features: ChaiServerFeatures;
  /** AI models and action routing, minus the server-only bits (see serializeAIConfigForClient). */
  ai: SerializedAIConfig;
  /** Media manager configuration — which tabs are on and what the search tab may offer. */
  mediaManager: ChaiMediaManagerConfig;
};

export class GetWebsiteDataAction extends ChaiBaseAction<GetWebsiteDataActionData, GetWebsiteDataActionResponse> {
  protected getValidationSchema() {
    return z.object({}).optional().default({});
  }

  async execute(): Promise<GetWebsiteDataActionResponse> {
    const websiteSettingsAction = new GetWebsiteSettingsAction();
    const websitePagesAction = new GetWebsitePagesAction();
    const pageTypesAction = new GetPageTypesAction();
    // The site library is plugin-owned — resolve its action from the registry;
    // without that plugin the builder gets an empty libraries list.
    const librariesAction = getChaiActionInstance("GET_LIBRARIES");
    const collectionsAction = new GetCollectionsAction();
    const repeaterDataAction = new GetRepeaterDataAction();

    // Set context on all sub-actions
    if (this.context) {
      websiteSettingsAction.setContext(this.context);
      websitePagesAction.setContext(this.context);
      pageTypesAction.setContext(this.context);
      librariesAction?.setContext(this.context);
      collectionsAction.setContext(this.context);
      repeaterDataAction.setContext(this.context);
    }

    // Execute remaining actions in parallel
    // NOTE: websitePagesAction fetches only primary pages (lang = "")
    const [websiteSettings, websitePages, pageTypes, libraries, collections, repeaterData] = await Promise.all([
      websiteSettingsAction.execute({ draft: true }),
      websitePagesAction.execute({ lang: "" }),
      pageTypesAction.execute(),
      librariesAction ? librariesAction.execute({}) : Promise.resolve([]),
      collectionsAction.execute(),
      repeaterDataAction.execute(),
    ]);

    return {
      websiteSettings,
      websitePages,
      pageTypes,
      libraries,
      collections,
      repeaterData,
      features: getConfigFeatures(),
      ai: serializeAIConfigForClient(getConfigAI()),
      mediaManager: getConfigMediaManager(),
    };
  }
}
