import { and, eq } from "drizzle-orm";
import { isEqual } from "lodash-es";
import { z } from "zod";
import { getAppFields, updateAppFields } from "~/server/chai-actions/apps/app-store";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { CHAI_DESIGN_SYSTEM_KEY, CHAI_PAGE_DESIGN_BRIEF_KEY } from "~/types/design-system";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";
import { serializeByKey } from "../utils/serialize-by-key";
import { chaiDesignSystemSchema, chaiPageDesignBriefSchema, formatZodIssues } from "./design-system-schema";

type SaveAiContextActionData = {
  type: "app" | "page";
  aiData: any;
  pageId?: string;
  /**
   * Shallow-merge `aiData` into what is stored (a `null` value deletes that key) instead of
   * replacing it. Used by callers that write one part of the context, like the design-system
   * tools. Without it the stored object is replaced, as it always was.
   */
  merge?: boolean;
  /**
   * Compare-and-swap for the level's design key: the save is refused (CONFLICT) unless the
   * stored value still equals this one; `null` expects none stored. A caller that reads the
   * value, patches it and writes it whole back uses it to catch a write that landed between.
   */
  expectedDesign?: unknown;
};

type SaveAiContextActionResponse = { success: boolean; aiData: unknown };

type AiRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AiRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The next stored value.
 *
 * Replace (the default) keeps its old meaning for every existing key. The one exception is
 * the design-system key of that level (`designSystem` on the site, `designBrief` on a page):
 * the builder's context modal never loads it, so a save from the modal must carry the stored
 * one over rather than silently delete it. Sending the key — `null` to remove it — still
 * replaces it.
 */
export function nextAiContextValue(current: unknown, incoming: unknown, designKey: string, merge: boolean): unknown {
  if (!isRecord(incoming)) return incoming;
  const stored = isRecord(current) ? current : {};

  if (merge) {
    const next: AiRecord = { ...stored };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  if (designKey in incoming) {
    if (incoming[designKey] !== null) return incoming;
    const { [designKey]: _removed, ...rest } = incoming;
    return rest;
  }
  return designKey in stored ? { ...incoming, [designKey]: stored[designKey] } : incoming;
}

/** The design value this save writes, or undefined when it leaves the stored one alone (or deletes it). */
const incomingDesignValue = (incoming: unknown, designKey: string): unknown =>
  isRecord(incoming) && incoming[designKey] !== null ? incoming[designKey] : undefined;

/**
 * A design system written from a stale copy (older `updatedAt` than the stored one) is
 * refused, not silently dropped: two editors — an agent and a person, say — must not undo
 * each other, and the caller must not report a save that did not happen.
 */
function assertNotStaleDesignValue(current: unknown, incoming: unknown, designKey: string): void {
  const stored = isRecord(current) ? current[designKey] : undefined;
  const value = incomingDesignValue(incoming, designKey);
  if (!isRecord(stored) || !isRecord(value)) return;
  const storedAt = typeof stored.updatedAt === "string" ? Date.parse(stored.updatedAt) : NaN;
  const incomingAt = typeof value.updatedAt === "string" ? Date.parse(value.updatedAt) : NaN;
  if (Number.isNaN(storedAt) || Number.isNaN(incomingAt) || incomingAt >= storedAt) return;
  throw new ActionError(
    `${designKey} was changed since this copy was read (stored ${stored.updatedAt}, yours ${value.updatedAt}). Read it again and reapply the change.`,
    "CONFLICT",
    409,
  );
}

function assertDesignUnchanged(current: unknown, designKey: string, expected: unknown): void {
  if (expected === undefined) return;
  const stored = isRecord(current) ? (current[designKey] ?? null) : null;
  if (isEqual(stored, expected)) return;
  throw new ActionError(
    `${designKey} was changed since it was read. Read it again and reapply the change.`,
    "CONFLICT",
    409,
  );
}

/**
 * Validates only a design value the save sends: a stored one carried over or kept by a merge
 * may be an older shape the lenient readers accept, and must not block unrelated saves.
 */
function validateDesignValue(incoming: unknown, designKey: string, schema: z.ZodType): void {
  const value = incomingDesignValue(incoming, designKey);
  if (value === undefined) return;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ActionError(`Invalid ${designKey}: ${formatZodIssues(parsed.error)}`, "INVALID_DATA", 400);
  }
}

export class SaveAiContextAction extends ChaiBaseAction<SaveAiContextActionData, SaveAiContextActionResponse> {
  protected getValidationSchema() {
    return z.object({
      type: z.enum(["app", "page"]),
      aiData: z.any(),
      pageId: z.string().optional(),
      merge: z.boolean().optional(),
      expectedDesign: z.any().optional(),
    });
  }

  async execute(data: SaveAiContextActionData): Promise<SaveAiContextActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }

    const { appId } = this.context;

    // Validate aiData is present
    if (data.aiData === undefined || data.aiData === null) {
      throw new ActionError("aiData is required", "INVALID_DATA");
    }
    // A merge writes keys into the stored object; anything but an object would replace it whole.
    if (data.merge === true && !isRecord(data.aiData)) {
      throw new ActionError("aiData must be an object when merge is true", "INVALID_DATA", 400);
    }

    if (data.type === "app") {
      validateDesignValue(data.aiData, CHAI_DESIGN_SYSTEM_KEY, chaiDesignSystemSchema);
      // Read, merge and write as one step per app, so parallel saves do not drop each other's keys.
      return serializeByKey(`apps:${appId}`, async () => {
        const { data: app, error: readError } = await getAppFields(appId, ["ai"]);
        if (readError) {
          throw new ActionError("Error reading app AI context", "UPDATE_ERROR", 500, readError);
        }

        assertDesignUnchanged(app?.ai, CHAI_DESIGN_SYSTEM_KEY, data.expectedDesign);
        assertNotStaleDesignValue(app?.ai, data.aiData, CHAI_DESIGN_SYSTEM_KEY);
        const next = nextAiContextValue(app?.ai, data.aiData, CHAI_DESIGN_SYSTEM_KEY, data.merge === true);

        const { error } = await updateAppFields(appId, { ai: next });

        if (error) {
          throw new ActionError("Error updating app AI context", "UPDATE_ERROR", 500, error);
        }
        return { success: true, aiData: next };
      });
    }

    if (!data.pageId) {
      throw new ActionError("pageId is required for page context", "INVALID_DATA");
    }
    validateDesignValue(data.aiData, CHAI_PAGE_DESIGN_BRIEF_KEY, chaiPageDesignBriefSchema);

    const pageId = data.pageId;
    return serializeByKey(`app-pages:${pageId}`, async () => {
      const pageWhere = and(eq(schema.appPages.id, pageId), eq(schema.appPages.app, appId));
      const { data: page, error: readError } = await safeQuery(() =>
        db.query.appPages.findFirst({ where: pageWhere, columns: { ai: true } }),
      );
      if (readError) {
        throw new ActionError("Error reading page AI context", "UPDATE_ERROR", 500, readError);
      }
      if (!page) {
        throw new ActionError("Page not found for this app", "NOT_FOUND", 404);
      }

      assertDesignUnchanged(page.ai, CHAI_PAGE_DESIGN_BRIEF_KEY, data.expectedDesign);
      assertNotStaleDesignValue(page.ai, data.aiData, CHAI_PAGE_DESIGN_BRIEF_KEY);
      const next = nextAiContextValue(page.ai, data.aiData, CHAI_PAGE_DESIGN_BRIEF_KEY, data.merge === true);

      const { data: updatedPages, error } = await safeQuery(async () =>
        db
          .update(schema.appPages)
          .set({ ai: next as any })
          .where(pageWhere)
          .returning(),
      );

      if (error) {
        throw new ActionError("Error updating page AI context", "UPDATE_ERROR", 500, error);
      }

      if (!updatedPages || updatedPages.length === 0) {
        throw new ActionError("Page not found for this app", "NOT_FOUND", 404);
      }

      return { success: true, aiData: next };
    });
  }
}
