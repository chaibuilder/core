import { and, eq, inArray, isNull } from "drizzle-orm";
import { get, isEmpty } from "lodash-es";
import { nanoid } from "nanoid";
import { getPartialWrapperTag, MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { ChaiBlock } from "~/types";

export function assignNewIds(blocks: ChaiBlock[]): ChaiBlock[] {
  const idMap = new Map<string, string>();

  blocks.forEach((block) => {
    idMap.set(block._id, nanoid());
  });

  return blocks.map((block) => ({
    ...block,
    _id: idMap.get(block._id)!,
    _parent: block._parent ? (idMap.get(block._parent) ?? block._parent) : block._parent,
  }));
}

export function extractPartialBlockIds(blocks: ChaiBlock[]): string[] {
  return blocks
    .filter(({ _type }) => _type === "GlobalBlock" || _type === "PartialBlock")
    .map((block) => get(block, "partialBlockId", get(block, "globalBlock", "")))
    .filter((id) => id !== "");
}

/**
 * Recursively inline partial blocks from `partialBlocksMap`. The per-branch
 * `visited` set breaks self-references and cycles (the reference is left
 * unexpanded), and `depth` caps the chain at MAX_PARTIAL_DEPTH — both guards
 * matter for pages authored outside the builder, where no add-time
 * validation ever ran.
 */
export function replacePartialBlocks(
  blocks: ChaiBlock[],
  partialBlocksMap: Map<string, ChaiBlock[]>,
  visited: Set<string> = new Set(),
  depth: number = 0,
): ChaiBlock[] {
  if (depth >= MAX_PARTIAL_DEPTH) {
    return blocks;
  }

  const result: ChaiBlock[] = [];

  for (const block of blocks) {
    if (block._type === "GlobalBlock" || block._type === "PartialBlock") {
      const partialBlockId = get(block, "partialBlockId", get(block, "globalBlock", ""));
      if (partialBlockId === "") {
        result.push(block);
        continue;
      }

      if (visited.has(partialBlockId)) {
        result.push(block);
        continue;
      }

      let partialBlocks = partialBlocksMap.get(partialBlockId) ?? [];
      if (partialBlocks.length === 0) {
        result.push(block);
        continue;
      }

      // Hide the whole partial: do not inline. (The PartialBlock node is removed
      // by merge, so `_show: false` on the reference would otherwise be lost.)
      if (block._show === false) {
        continue;
      }

      partialBlocks = assignNewIds(partialBlocks);

      // A placement with a wrapper tag stays in the tree as that element and
      // takes the inlined roots as its children; otherwise it is replaced.
      const hasWrapper = getPartialWrapperTag(block) !== null;

      // Re-parent inlined roots under the wrapper or the PartialBlock/GlobalBlock's parent.
      // Never broadcast `_show: true` onto children — that un-hid authored
      // `_show: false` forks (mobile/desktop / theme variants).
      partialBlocks = partialBlocks.map((b) => {
        if (isEmpty(b._parent)) b._parent = hasWrapper ? block._id : block._parent;
        return b;
      });

      const newVisited = new Set(visited);
      newVisited.add(partialBlockId);

      const expandedBlocks = replacePartialBlocks(partialBlocks, partialBlocksMap, newVisited, depth + 1);
      if (hasWrapper) result.push(block);
      result.push(...expandedBlocks);
    } else {
      result.push(block);
    }
  }

  return result;
}

/**
 * Fill `partialBlocksMap` with every partial referenced by `blocks` or by an
 * already-collected partial, fetching missing ones from the draft or online
 * table. Handles nested partials level by level (bounded by
 * MAX_PARTIAL_DEPTH) and never refetches an id, so cycles and dangling
 * references terminate. Pre-seeded entries cost no queries — with a complete
 * `partialBlocks` page column this is query-free; with a stale or absent
 * column it degrades to one query per missing level.
 *
 * Soft-deleted partials (moved to trash, deletedAt set) are excluded — their
 * references stay unexpanded so trashed content never renders in draft mode.
 */
export async function collectPartialBlocksMap(
  blocks: ChaiBlock[],
  partialBlocksMap: Map<string, ChaiBlock[]>,
  draft: boolean,
  appId: string,
): Promise<Map<string, ChaiBlock[]>> {
  const table = draft ? schema.appPages : schema.appPagesOnline;
  const attempted = new Set<string>(partialBlocksMap.keys());

  const findMissingIds = (): string[] => {
    const referenced = new Set<string>(extractPartialBlockIds(blocks));
    partialBlocksMap.forEach((partialBlocks) => {
      extractPartialBlockIds(partialBlocks).forEach((id) => referenced.add(id));
    });
    return [...referenced].filter((id) => !attempted.has(id));
  };

  for (let depth = 0; depth < MAX_PARTIAL_DEPTH; depth++) {
    const idsToFetch = findMissingIds();
    if (idsToFetch.length === 0) break;

    idsToFetch.forEach((id) => attempted.add(id));

    const { data: partialResults, error } = await safeQuery(() =>
      db
        .select({
          id: table.id,
          blocks: table.blocks,
        })
        .from(table)
        .where(and(eq(table.app, appId), inArray(table.id, idsToFetch), isNull(table.deletedAt))),
    );

    if (error) {
      throw new Error("FAILED_TO_FETCH_PARTIAL_BLOCKS", { cause: error });
    }

    if (partialResults) {
      partialResults.forEach((result: { id: string; blocks: unknown }) => {
        partialBlocksMap.set(result.id, (result.blocks as ChaiBlock[]) ?? []);
      });
    }
  }

  return partialBlocksMap;
}

/**
 * Transitive closure of partial page ids used by `blocks`, bounded by
 * MAX_PARTIAL_DEPTH. Only ids that exist in the draft table are returned —
 * this is what belongs in a page's denormalized `partialBlocks` column.
 * Sorted so the stored column is deterministic regardless of DB result
 * ordering (avoids spurious writes and cache churn).
 */
export async function computePartialIdsClosure(blocks: ChaiBlock[], appId: string): Promise<string[]> {
  const map = await collectPartialBlocksMap(blocks, new Map(), true, appId);
  return [...map.keys()].sort();
}
