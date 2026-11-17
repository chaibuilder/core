import { isEmpty } from "lodash-es";
import { useMemo } from "react";
import { useChaiPrimaryPages } from "../..";

type BlocksWithDesignTokens = Record<string, string>;
export interface SiteWideUsage {
  [pageId: string]: {
    name: string;
    isPartial: boolean;
    partialBlocks: string[];
    links: string[];
    designTokens: BlocksWithDesignTokens; // { blockId: Name, blockId: name 2}
  };
}

function deriveSiteWideUsage(defaultLangPages: any[]): SiteWideUsage {
  const siteWideUsage: SiteWideUsage = {};
  for (const page of defaultLangPages) {
    siteWideUsage[page.id] = {
      name: page.name,
      isPartial: isEmpty(page.slug),
      partialBlocks: !page.partialBlocks ? [] : (page.partialBlocks as string).split("|").filter(Boolean),
      links: !page.links ? [] : (page.links as string).split("|").filter(Boolean),
      designTokens: (page.designTokens ?? {}) as BlocksWithDesignTokens,
    };
  }
  return siteWideUsage;
}

export const useSiteWideUsage = () => {
  const { data: websitePages } = useChaiPrimaryPages();
  const data = useMemo(() => deriveSiteWideUsage(websitePages ?? []), [websitePages]);
  return { data };
};
