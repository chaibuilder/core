import { getResolvedPageTypes } from "~/server/defaults/config-registry";
import { ChaiPageType } from "~/types";

export {
  findMatchingDynamicPages,
  findPageBySlug,
  getPaginationBaseSlug,
  inheritDynamicFlagsFromPrimary,
} from "./find-page-by-slug";

export function getDynamicSegmentsConfig(): Record<string, string> {
  const pageTypes = getResolvedPageTypes();
  return pageTypes.reduce(
    (acc: Record<string, string>, pageType: ChaiPageType) => {
      if (pageType.dynamicSegments) {
        acc[pageType.key] = pageType.dynamicSegments;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}
