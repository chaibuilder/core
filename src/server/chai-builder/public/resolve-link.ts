import { startsWith } from "lodash-es";
import { getResolvedPageType } from "~/server/defaults/config-registry";
import { getInitializedState } from "../state";
import { withRequestCache } from "./cache-utils";
import { resolvePageSlug } from "./get-page-slug-by-id";

async function resolveLinkImpl(href: string, lang: string): Promise<string> {
  if (!startsWith(href, "pageType:")) {
    return href;
  }

  const parts = href.split(":");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return "#";
  }
  const pageTypeKey = parts[1];
  const id = parts[2];
  const pageType = getResolvedPageType(pageTypeKey);

  if (!pageType) {
    return "#";
  }

  const state = getInitializedState();

  if (pageType.resolveLink) {
    return await pageType.resolveLink(id, state.draftMode, lang);
  }

  const slug = await resolvePageSlug(id, lang);
  return slug ?? "#";
}

export const resolveLink = withRequestCache(resolveLinkImpl, "resolveLink");
