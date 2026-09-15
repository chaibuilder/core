import { startsWith } from "lodash-es";
import { cache } from "react";
import { getResolvedPageType } from "~/server/defaults";
import type { ChaiBlock } from "~/types";
import { getFallbackLang } from "../internal/init";
import { getInitializedState } from "../state";
import { withRequestCache } from "./cache-utils";
import { resolvePageSlugs } from "./get-page-slug-by-id";

type LinkRef = {
  pageTypeKey: string;
  id: string;
  href: string;
};

type ExtractedLinks = {
  linkRefs: LinkRef[];
  /** Indexes of blocks containing any `pageType:` string — the only blocks the transform pass can change. */
  linkBlockIndexes: Set<number>;
};

function extractLinksFromBlocks(blocks: ChaiBlock[]): ExtractedLinks {
  const linkRefs: LinkRef[] = [];
  const seen = new Set<string>();
  const linkBlockIndexes = new Set<number>();
  let blockHasLink = false;

  function processValue(value: any) {
    if (!value) return;

    if (typeof value === "string" && startsWith(value, "pageType:")) {
      // Flag on ANY `pageType:` string, not only well-formed refs: the transform's
      // `pageId` backfill fires on href shape alone, so malformed refs still matter.
      blockHasLink = true;
      const parts = value.split(":");
      if (parts.length === 3 && parts[1] && parts[2]) {
        const href = value;
        if (!seen.has(href)) {
          seen.add(href);
          linkRefs.push({
            pageTypeKey: parts[1],
            id: parts[2],
            href,
          });
        }
      }
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(processValue);
      } else {
        Object.values(value).forEach(processValue);
      }
    }
  }

  blocks.forEach((block, index) => {
    blockHasLink = false;
    processValue(block);
    if (blockHasLink) linkBlockIndexes.add(index);
  });
  return { linkRefs, linkBlockIndexes };
}

// Stable function reference for caching - defined once at module level
async function resolveLinksData(
  appId: string,
  draftMode: boolean,
  resolvedLang: string,
  pageId: string,
  blocks: ChaiBlock[],
): Promise<ChaiBlock[]> {
  const { linkRefs, linkBlockIndexes } = extractLinksFromBlocks(blocks);
  if (linkRefs.length === 0) {
    return blocks;
  }

  const linkMap = new Map<string, string>();

  // Group by pageType for custom resolvers
  const byPageType = new Map<string, LinkRef[]>();
  linkRefs.forEach((ref) => {
    const arr = byPageType.get(ref.pageTypeKey) || [];
    arr.push(ref);
    byPageType.set(ref.pageTypeKey, arr);
  });

  // Resolve each pageType group
  await Promise.all(
    Array.from(byPageType.entries()).map(async ([pageTypeKey, refs]) => {
      const pageType = getResolvedPageType(pageTypeKey);

      if (!pageType) {
        refs.forEach((ref) => linkMap.set(ref.href, "#"));
        return;
      }

      // Custom resolver
      if (pageType.resolveLink) {
        await Promise.all(
          refs.map(async (ref) => {
            try {
              const resolved = await pageType.resolveLink!(ref.id, draftMode, resolvedLang);
              linkMap.set(ref.href, resolved);
            } catch {
              linkMap.set(ref.href, "#");
            }
          }),
        );
        return;
      }

      const slugById = await resolvePageSlugs(
        refs.map((ref) => ref.id),
        resolvedLang,
      );
      refs.forEach((ref) => {
        linkMap.set(ref.href, slugById.get(ref.id) ?? "#");
      });
    }),
  );

  // Transform blocks with resolved links
  function transformValue(value: any): any {
    if (!value) return value;

    if (typeof value === "string" && startsWith(value, "pageType:")) {
      return linkMap.get(value) || value;
    }

    if (Array.isArray(value)) {
      return value.map(transformValue);
    }

    if (typeof value === "object" && value !== null) {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = transformValue(val);
      }
      // For link-shaped objects, preserve the referenced page id alongside the
      // resolved href slug. Consumers (e.g. data providers) rely on `pageId`,
      // which would otherwise be lost once the `pageType:` href is rewritten.
      if (typeof value.href === "string" && startsWith(value.href, "pageType:")) {
        const parts = value.href.split(":");
        if (parts.length === 3 && parts[2]) result.pageId = parts[2];
      }
      return result;
    }

    return value;
  }

  // Copy-on-write: only blocks containing links are re-built; link-less blocks keep identity.
  return blocks.map((block, index) => (linkBlockIndexes.has(index) ? (transformValue(block) as ChaiBlock) : block));
}

export const resolveLinksInPageBlocks = cache(
  async (page: { id: string; blocks: ChaiBlock[]; lang?: string }, lang?: string): Promise<ChaiBlock[]> => {
    const state = getInitializedState();
    const resolvedLang = lang || state.lang || (await getFallbackLang());

    return await withRequestCache(resolveLinksData, "resolveLinksData")(
      state.appId!,
      state.draftMode,
      resolvedLang,
      page.id,
      page.blocks,
    );
  },
);
