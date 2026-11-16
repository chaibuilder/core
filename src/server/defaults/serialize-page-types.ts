import { isFunction } from "lodash-es";
import type { ChaiPageTypeEntry } from "~/types/chaibuilder-config";

export type SerializedPageType = {
  key: string;
  name: string;
  helpText: string;
  icon: string;
  dynamicSegments?: string;
  dynamicSlug?: string;
  hasSlug: boolean;
  /** Whether the page type can list/search its items. False means the selector only accepts a typed identifier. */
  hasGetDynamicPages: boolean;
  pluralName?: string;
  editUrl?: string;
  createUrl?: string;
  trackingDefault?: unknown;
  defaultSeo?: unknown;
  defaultJSONLD?: unknown;
};

export async function serializePageTypesForClient(pageTypes: ChaiPageTypeEntry[]): Promise<SerializedPageType[]> {
  return Promise.all(
    pageTypes.map(async (pageType) => ({
      key: pageType.key,
      helpText: pageType.helpText ?? "",
      icon: pageType.icon ?? "",
      dynamicSegments: pageType.dynamicSegments ?? "",
      dynamicSlug: pageType.dynamicSlug ?? "",
      hasSlug: pageType.partial ? false : (pageType.hasSlug ?? true),
      hasGetDynamicPages: isFunction(pageType.getDynamicPages),
      name: typeof pageType.name === "function" ? await pageType.name() : pageType.name,
      pluralName: typeof pageType.pluralName === "function" ? await pageType.pluralName() : pageType.pluralName,
      ...(pageType.editUrl ? { editUrl: pageType.editUrl } : {}),
      ...(pageType.createUrl ? { createUrl: pageType.createUrl } : {}),
      ...(isFunction(pageType.defaultTrackingInfo) ? { trackingDefault: pageType.defaultTrackingInfo() } : {}),
      ...(isFunction(pageType.defaultSeo) ? { defaultSeo: pageType.defaultSeo() } : {}),
      ...(isFunction(pageType.defaultJSONLD) ? { defaultJSONLD: pageType.defaultJSONLD() } : {}),
    })),
  );
}
