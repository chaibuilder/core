import { escape, startsWith } from "lodash-es";
import { cache } from "react";
import { getResolvedPageType } from "~/server/defaults/config-registry";
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

/**
 * `href="pageType:…"` inside an HTML string (an anchor in rich text). The prop is
 * not itself a reference, so it is matched per anchor rather than by prefix.
 */
const EMBEDDED_REF_HREF_SOURCE = /(\shref\s*=\s*)(["'])(pageType:[^"']*)\2/.source;
const EMBEDDED_REF_HREF_REGEX = new RegExp(EMBEDDED_REF_HREF_SOURCE, "gi");
// Non-global twin for detection: `.test()` on a /g regex is stateful (lastIndex).
const EMBEDDED_REF_HREF_TEST = new RegExp(EMBEDDED_REF_HREF_SOURCE, "i");

const hasEmbeddedRef = (value: string) => value.includes("pageType:") && EMBEDDED_REF_HREF_TEST.test(value);

function extractLinksFromBlocks(blocks: ChaiBlock[]): ExtractedLinks {
  const linkRefs: LinkRef[] = [];
  const seen = new Set<string>();
  const linkBlockIndexes = new Set<number>();
  let blockHasLink = false;

  function addRef(href: string) {
    const parts = href.split(":");
    if (parts.length === 3 && parts[1] && parts[2] && !seen.has(href)) {
      seen.add(href);
      linkRefs.push({ pageTypeKey: parts[1], id: parts[2], href });
    }
  }

  function processValue(value: any) {
    if (!value) return;

    if (typeof value === "string" && startsWith(value, "pageType:")) {
      // Flag on ANY `pageType:` string, not only well-formed refs: the transform's
      // `pageId` backfill fires on href shape alone, so malformed refs still matter.
      blockHasLink = true;
      addRef(value);
    } else if (typeof value === "string" && hasEmbeddedRef(value)) {
      blockHasLink = true;
      for (const match of value.matchAll(EMBEDDED_REF_HREF_REGEX)) addRef(match[3]);
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

    // An unresolvable embedded ref becomes "#" like a Link block's: a literal
    // `pageType:` href is a dead link for the visitor. Escaped: the URL is spliced
    // into a quoted attribute of raw HTML.
    if (typeof value === "string" && hasEmbeddedRef(value)) {
      return value.replace(
        EMBEDDED_REF_HREF_REGEX,
        (_match, prefix, quote, ref) => `${prefix}${quote}${escape(linkMap.get(ref) || "#")}${quote}`,
      );
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
