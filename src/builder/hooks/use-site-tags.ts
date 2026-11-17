import { useMemo } from "react";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";

/**
 * Seed tag suggestions offered even before a site has created any tags of its
 * own. Merged with the site's existing tags (deduped case-insensitively).
 */
export const DEFAULT_SITE_TAGS = ["Section", "CTA"];

/**
 * Site-wide tag vocabulary for pages and partials/global blocks: the union of
 * `metadata[PARTIAL_TAGS_METADATA_KEY]` (currently `__tags`) across ALL pages,
 * merged with DEFAULT_SITE_TAGS, deduped case-insensitively (first-seen casing
 * wins), sorted alphabetically.
 */
export const useSiteTags = (): string[] => {
  const { data: projectPages } = useChaiPrimaryPages();

  return useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    const add = (tag: unknown) => {
      if (typeof tag !== "string") return;
      const cleaned = tag.trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(cleaned);
    };

    for (const page of projectPages ?? []) {
      const tags = (page as any)?.metadata?.[PARTIAL_TAGS_METADATA_KEY];
      if (Array.isArray(tags)) tags.forEach(add);
    }

    DEFAULT_SITE_TAGS.forEach(add);

    return result.sort((a, b) => a.localeCompare(b));
  }, [projectPages]);
};
