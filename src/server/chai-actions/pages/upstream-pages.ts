import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { ActionError } from "~/server/chai-actions/action-error";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { routingTagsForMutation } from "~/server/chai-builder/public/page-routing-cache";
import { computePartialIdsClosure } from "~/server/chai-builder/public/partial-merge-utils";
import { getConfigUpstreamPageSource, isFeatureEnabled } from "~/server/defaults/config-registry";
import type { ChaiUpstreamPageSource } from "~/types/chaibuilder-config";
import { derivePageRefs } from "~/utils/derive-page-refs";
import { nextLastSaved } from "./next-last-saved";

/** The host's upstream page source; refuses while the feature is off or no source is configured. */
export function assertUpstreamPagesEnabled(): ChaiUpstreamPageSource {
  const source = getConfigUpstreamPageSource();
  if (!isFeatureEnabled("upstreamPages") || !source) {
    throw new ActionError("Upstream pages are not enabled", "FEATURE_DISABLED", 403);
  }
  return source;
}

export type LinkableUpstreamPage = NonNullable<Awaited<ReturnType<ChaiUpstreamPageSource["findLinkable"]>>>;

/** The upstream page `upstreamId` if `userId` may link it into `appId`, else null. The host decides. */
export async function findLinkableUpstream(args: {
  appId: string;
  userId: string | undefined;
  upstreamId: string;
}): Promise<LinkableUpstreamPage | null> {
  const source = assertUpstreamPagesEnabled();
  if (!args.userId) return null;
  try {
    return await source.findLinkable({ id: args.upstreamId, appId: args.appId, userId: args.userId });
  } catch (error) {
    throw new ActionError("Failed to read upstream page", "UPSTREAM_LOOKUP_FAILED", 500, error);
  }
}

const pageIdSchema = z.object({ id: z.string().uuid() });

/** A page of this app that has an upstream page, in the given linked state. */
const linkedPageWhere = (id: string, appId: string, useUpstream: boolean) =>
  and(
    eq(schema.appPages.id, id),
    eq(schema.appPages.app, appId),
    eq(schema.appPages.useUpstream, useUpstream),
    isNotNull(schema.appPages.upstream),
    isNull(schema.appPages.deletedAt),
  );

/** The stored upstream id and save version of a page of this app in the given linked state, or a 404. */
async function readUpstreamPointer(
  id: string,
  appId: string,
  useUpstream: boolean,
): Promise<{ upstream: string; lastSaved: string | null }> {
  const { data, error } = await safeQuery(() =>
    db
      .select({ upstream: schema.appPages.upstream, lastSaved: schema.appPages.lastSaved })
      .from(schema.appPages)
      .where(linkedPageWhere(id, appId, useUpstream))
      .limit(1),
  );
  if (error) throw new ActionError("Failed to read page", "UPSTREAM_LOOKUP_FAILED", 500, error);
  const upstream = data?.[0]?.upstream;
  if (!upstream) throw new ActionError("Upstream page not found", "UPSTREAM_PAGE_NOT_FOUND", 404);
  return { upstream, lastSaved: data[0].lastSaved ?? null };
}

/** Matches the save version read with the pointer, so a write in between makes this update match nothing. */
const sameVersion = (lastSaved: string | null) =>
  lastSaved === null ? isNull(schema.appPages.lastSaved) : eq(schema.appPages.lastSaved, lastSaved);

/**
 * Copy the upstream page's published blocks and SEO into a linked page so it can be edited, keeping
 * the `upstream` pointer for a later reset. Draft only: the copy goes live on publish.
 */
export class CloneUpstreamPageAction extends ChaiBaseAction<{ id: string }, { tags: string[] }> {
  protected getValidationSchema() {
    return pageIdSchema;
  }

  async execute(input: { id: string }): Promise<{ tags: string[] }> {
    const source = assertUpstreamPagesEnabled();
    const { id } = pageIdSchema.parse(input);
    const appId = this.context!.appId;

    // The upstream is reached only through the linked page's own stored pointer.
    const { upstream: upstreamId, lastSaved } = await readUpstreamPointer(id, appId, true);
    const content = await source.getContent(upstreamId, { appId }).catch((error: unknown) => {
      throw new ActionError("Failed to read upstream page", "UPSTREAM_LOOKUP_FAILED", 500, error);
    });
    if (!content) throw new ActionError("Upstream page not found", "UPSTREAM_PAGE_NOT_FOUND", 404);

    const blocks = content.blocks ?? [];
    const { linkPageIds, designTokens } = derivePageRefs(blocks);
    const partialBlocks = (await computePartialIdsClosure(blocks, appId)).join("|");

    const { data: updated, error } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({
          blocks,
          seo: content.seo ?? {},
          links: linkPageIds.join("|"),
          partialBlocks,
          designTokens,
          useUpstream: false,
          changes: ["Page", "SEO"],
          // A save still holding the pre-clone version must get PAGE_CHANGED, not overwrite the copy.
          lastSaved: nextLastSaved(lastSaved),
        })
        .where(and(linkedPageWhere(id, appId, true), eq(schema.appPages.upstream, upstreamId), sameVersion(lastSaved)))
        .returning({ id: schema.appPages.id }),
    );
    if (error) throw new ActionError("Failed to duplicate upstream page", "CLONE_UPSTREAM_FAILED", 500, error);
    if (!updated?.length) throw new ActionError("Page not found", "PAGE_NOT_FOUND", 404);
    return { tags: routingTagsForMutation(id) };
  }
}

/**
 * Point a cloned page back at its upstream page and discard the copy. Draft only. Refused when the
 * host no longer lets this user link that upstream page into this app.
 */
export class ResetToUpstreamAction extends ChaiBaseAction<{ id: string }, { tags: string[] }> {
  protected getValidationSchema() {
    return pageIdSchema;
  }

  async execute(input: { id: string }): Promise<{ tags: string[] }> {
    assertUpstreamPagesEnabled();
    const { id } = pageIdSchema.parse(input);
    const appId = this.context!.appId;

    const { upstream: upstreamId, lastSaved } = await readUpstreamPointer(id, appId, false);
    if (!(await findLinkableUpstream({ appId, userId: this.context?.userId, upstreamId }))) {
      throw new ActionError("This page cannot be reset to its upstream page", "UPSTREAM_PAGE_NOT_FOUND", 404);
    }

    // The pointer is matched again, so a page re-pointed meanwhile is not reset to an unchecked page.
    const { data: updated, error } = await safeQuery(() =>
      db
        .update(schema.appPages)
        .set({
          useUpstream: true,
          blocks: [],
          partialBlocks: "",
          links: "",
          designTokens: {},
          changes: ["Page"],
          // A save still holding the clone's version must get PAGE_CHANGED, not restore it.
          lastSaved: nextLastSaved(lastSaved),
        })
        .where(and(linkedPageWhere(id, appId, false), eq(schema.appPages.upstream, upstreamId), sameVersion(lastSaved)))
        .returning({ id: schema.appPages.id }),
    );
    if (error) throw new ActionError("Failed to reset to upstream", "RESET_UPSTREAM_FAILED", 500, error);
    if (!updated?.length) {
      throw new ActionError("This page cannot be reset to its upstream page", "UPSTREAM_PAGE_NOT_FOUND", 404);
    }
    return { tags: routingTagsForMutation(id) };
  }
}
