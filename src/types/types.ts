import * as React from "react";

export type ChaiRenderBlockProps<T> = {
  blockProps: Record<string, string>;
  children?: React.ReactNode;
  inBuilder: boolean;
} & T;

export type ChaiBlockStyles = Record<string, string>;

export interface ChaiDesignTokens {
  [uniqueId: string]: {
    name: string;
    description?: string;
    value: string;
    archived?: boolean;
  };
}

type ChaiBlocksWithDesignTokens = Record<string, string>;
export interface ChaiSiteWideUsageData {
  [pageId: string]: {
    name: string;
    isPartial: boolean;
    partialBlocks: string[];
    links: string[];
    designTokens: ChaiBlocksWithDesignTokens; // { blockId: Name, blockId: name 2}
  };
}
