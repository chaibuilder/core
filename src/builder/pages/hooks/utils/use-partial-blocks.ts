import { filter, has, isEmpty, startCase } from "lodash-es";
import { useCallback } from "react";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { ChaiBlock } from "~/types/common";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";
import { useFetch } from "./use-fetch";

export const usePartialBlocksFn = (): {
  getPartialBlocks: () => Promise<Record<string, { name: string; description?: string; type: string; tags: string[] }>>;
  getPartialBlockBlocks: (partialBlockKey: string) => Promise<ChaiBlock[]>;
} => {
  const { data: projectPages } = useChaiPrimaryPages();
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return {
    getPartialBlocks: useCallback(async () => {
      const partialBlocks: Record<string, { name: string; description?: string; type: string; tags: string[] }> = {};
      for (const page of projectPages ?? []) {
        if (isEmpty(page?.slug)) {
          const metadata = (page as any).metadata;
          const rawTags = metadata?.[PARTIAL_TAGS_METADATA_KEY];
          partialBlocks[page.id as string] = {
            type: page.pageType,
            name: startCase(page.name ?? page.slug),
            description: typeof metadata?.description === "string" ? metadata.description : "",
            tags: Array.isArray(rawTags) ? rawTags.filter((t: unknown) => typeof t === "string") : [],
          };
        }
      }
      return partialBlocks;
    }, [projectPages]),
    getPartialBlockBlocks: useCallback(
      async (partialBlockKey: string) => {
        if (!partialBlockKey) return [];
        // Errors deliberately bubble up: a deleted partial answers 404 and the
        // caller marks it missing in the outline. Swallowing it here would make a
        // deleted partial indistinguishable from an empty one.
        const data = await fetchAPI(apiUrl, {
          action: "GET_DRAFT_PAGE",
          data: {
            id: partialBlockKey,
            draft: true,
            editor: false,
            mergePartials: true,
          },
        });
        return filter((data as any).blocks, (block: ChaiBlock) => has(block, "_id"));
      },
      [fetchAPI, apiUrl],
    ),
  };
};
