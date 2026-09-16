import { compact } from "lodash-es";
import type { ChaiBlock } from "~/types/common";

/** `pageType:<type>:<uuid>` link references embedded in block props. */
const LINK_REGEX = /pageType:[^:]+:([a-f0-9-]{36})/gi;
/** `dt#<token>` design-token references embedded in block props. */
const TOKEN_REGEX = /dt#[^ "]+/g;

export type PageRefs = {
  /** Ids of pages this page links to. Denormalized into `app_pages.links`. */
  linkPageIds: string[];
  /** `{ "dt#token": { blockId: blockName } }`. Denormalized into `app_pages.designTokens`. */
  designTokens: Record<string, Record<string, string>>;
};

/**
 * Extract the denormalized reference columns a page carries about its own
 * blocks. Both are pure functions of `blocks`, so they are derived here on the
 * server rather than trusted from whichever client happened to send the save —
 * the same reason `computePartialIdsClosure` recomputes `partialBlocks`.
 *
 * Each block is serialized once and both patterns are scanned off that single
 * string.
 */
export const derivePageRefs = (blocks: ChaiBlock[]): PageRefs => {
  const uuids = new Set<string>();
  const designTokens: Record<string, Record<string, string>> = {};

  for (const block of blocks ?? []) {
    const blockStr = JSON.stringify(block);
    let match: RegExpExecArray | null;

    LINK_REGEX.lastIndex = 0;
    while ((match = LINK_REGEX.exec(blockStr)) !== null) {
      if (match[1]) uuids.add(match[1]);
    }

    TOKEN_REGEX.lastIndex = 0;
    while ((match = TOKEN_REGEX.exec(blockStr)) !== null) {
      if (match[0]) {
        const tokenId = match[0];
        if (!designTokens[tokenId]) {
          designTokens[tokenId] = {};
        }
        designTokens[tokenId][block._id] = block._name || block._type;
      }
    }
  }

  return { linkPageIds: compact([...uuids]), designTokens };
};
