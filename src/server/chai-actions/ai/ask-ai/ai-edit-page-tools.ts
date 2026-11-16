import { tool, zodSchema } from "ai";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getInitializedStateWithUser } from "~/server/chai-builder/state";
import { extractBlockHtmlSlices } from "~/utils/export-html/extract-block-html-slices";
import { getLinkablePages, toPageLinkRef } from "~/utils/internal-link-refs";
import { getPartialDepth, getPartialUsageDepth } from "~/utils/partial-nesting";
import { AI_EDIT_TOOL_DESCRIPTIONS, buildAiEditToolFields } from "./ai-edit-tool-contract";
import { isValidAiBindingTemplate } from "./ai-edit-executors";
import type { AiDataBindingPaths } from "./ai-edit-page-prompt-context";

export { extractBlockHtmlSlices, isValidAiBindingTemplate };

const fields = buildAiEditToolFields(z);

const buildBindPropTool = ({
  dataBindingPaths,
  scopedBlockId,
}: {
  dataBindingPaths?: AiDataBindingPaths;
  scopedBlockId?: string;
}) =>
  tool({
    description:
      `Set a safe path | formatter binding on ${scopedBlockId ? `the selected block "${scopedBlockId}"` : "a specific block"}. ` +
      "Use a plain {{path}} unless user-requested output needs a formatter; never add default routinely. " +
      "Use only paths and formatters from the system prompt catalogs. Boolean-returning formatters are valid only when propName is '_show'.",
    inputSchema: zodSchema(
      z
        .object({
          task: z.string().nullish().describe("Short user-facing progress label"),
          blockId: z.string().describe(scopedBlockId ? `must be "${scopedBlockId}"` : "bid of the block to update"),
          propName: z.string().describe("camelCase prop name on the block; use _show for conditional visibility"),
          bindingPath: z
            .string()
            .describe(
              "Full safe binding including double braces, e.g. '{{product.name}}' or '{{product.price | currency 'USD'}}'",
            ),
        })
        .superRefine((input, context) => {
          if (scopedBlockId && input.blockId !== scopedBlockId) {
            context.addIssue({
              code: "custom",
              path: ["blockId"],
              message: `Only block "${scopedBlockId}" may be bound in this conversation`,
            });
          }
          if (!isValidAiBindingTemplate(input.bindingPath, input.propName, dataBindingPaths)) {
            context.addIssue({
              code: "custom",
              path: ["bindingPath"],
              message:
                "Binding must use an advertised data path and registered formatter valid for this property; boolean formatters require _show",
            });
          }
        }),
    ),
  });

/**
 * Read-only page lookup so a link can be written as a stable `pageType:` reference.
 * Offered to block-scoped runs too: linking one button is a single-block edit.
 */
const buildGetPagesListTool = () =>
  tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.get_pages_list,
    inputSchema: zodSchema(z.object({})),
    execute: async (): Promise<{
      pages: { name: string; slug: string; pageType: string; linkRef: string }[];
      note: string;
    }> => {
      const { appId } = getInitializedStateWithUser();
      const { data: pages, error } = await safeQuery(() =>
        db
          .select({
            id: schema.appPages.id,
            name: schema.appPages.name,
            slug: schema.appPages.slug,
            pageType: schema.appPages.pageType,
            primaryPage: schema.appPages.primaryPage,
            dynamic: schema.appPages.dynamic,
          })
          .from(schema.appPages)
          .where(
            and(
              eq(schema.appPages.app, appId),
              // Primary-language, routable pages: a link always anchors to the
              // primary page, and partials (empty slug) have no URL to link to.
              ne(schema.appPages.slug, ""),
              eq(schema.appPages.lang, ""),
              isNull(schema.appPages.deletedAt),
            ),
          )
          .orderBy(asc(schema.appPages.slug)),
      );

      if (error) {
        throw new Error(`Failed to fetch pages: ${error.message}`);
      }

      return {
        pages: getLinkablePages((pages as any[]) ?? []).map((page) => ({
          name: page.name,
          slug: page.slug,
          pageType: page.pageType ?? "page",
          linkRef: toPageLinkRef(page),
        })),
        note: "Use linkRef as the href when linking to a page. Never write the slug — slugs change, a linkRef does not.",
      };
    },
  });

/**
 * Tools available to the AI during page editing (AI SDK v6 UIMessage flow).
 *
 * Client-executed tools (no execute()): the builder applies them to its JSON
 * block state and reports back via addToolResult. HTML inside edit_block /
 * add_blocks streams as tool-input deltas, which the client renders live on
 * the canvas — this preserves the streaming preview the old text protocol had.
 *
 * Server-executed tools: get_partial_blocks and get_pages_list (DB lookups) and
 * read_block_html (slices the per-request page HTML, which is intentionally kept OUT of the
 * model context — the model sees only the page outline and reads on demand).
 *
 * NOTE for edit_block/add_blocks: `task` is declared before `html` on purpose —
 * tool-input streaming parses fields in order, so the client learns the target
 * and label before HTML starts flowing.
 */
const buildAllAiEditPageTools = ({
  pageHtml,
  pageId,
  dataBindingPaths,
}: {
  pageHtml: string;
  pageId?: string;
  dataBindingPaths?: AiDataBindingPaths;
}) => ({
  read_block_html: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.read_block_html,
    // Typed inline (not via the loose shared factory) because this is the one
    // shared tool with a server execute() — the factory's fields widen to `any`,
    // which conflicts with the execute input type. The MCP side still sources
    // this field shape from the shared contract.
    inputSchema: zodSchema(
      z.object({
        blockIds: z.array(z.string()).min(1).describe("bids of the blocks to read"),
      }),
    ),
    execute: async ({ blockIds }: { blockIds: string[] }) => extractBlockHtmlSlices(pageHtml, blockIds),
  }),

  edit_block: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.edit_block,
    inputSchema: zodSchema(
      z.object({
        task: z.string().describe("Short user-facing progress label, e.g. 'Redesigning hero section'"),
        ...fields.edit_block,
      }),
    ),
  }),

  add_blocks: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.add_blocks,
    inputSchema: zodSchema(
      z.object({
        task: z.string().describe("Short user-facing progress label, e.g. 'Adding pricing section'"),
        ...fields.add_blocks,
      }),
    ),
  }),

  remove_blocks: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.remove_blocks,
    inputSchema: zodSchema(
      z.object({
        ...fields.remove_blocks,
        task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Removing testimonial section'"),
      }),
    ),
  }),

  add_custom_block: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.add_custom_block,
    inputSchema: zodSchema(
      z.object({
        task: z.string().nullish().describe("Short user-facing progress label"),
        ...fields.add_custom_block,
      }),
    ),
  }),

  bind_prop: buildBindPropTool({ dataBindingPaths }),

  get_partial_blocks: tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.get_partial_blocks,
    inputSchema: zodSchema(z.object({})),
    execute: async (): Promise<{
      partials: Record<string, { name?: string; description?: string; type?: string }>;
      note?: string;
    }> => {
      const { appId } = getInitializedStateWithUser();
      const { data: pages, error } = await safeQuery(() =>
        db
          .select({
            id: schema.appPages.id,
            name: schema.appPages.name,
            metadata: schema.appPages.metadata,
            pageType: schema.appPages.pageType,
            partialBlocks: schema.appPages.partialBlocks,
          })
          .from(schema.appPages)
          .where(
            and(
              eq(schema.appPages.app, appId),
              // Partials are slug-less pages (their page type has hasSlug: false).
              // Match on empty slug rather than a specific pageType so all partial
              // types (e.g. the built-in "global") are included.
              eq(schema.appPages.slug, ""),
              eq(schema.appPages.lang, ""),
              isNull(schema.appPages.deletedAt),
            ),
          ),
      );

      if (error) {
        throw new Error(`Failed to fetch partial blocks: ${error.message}`);
      }

      const partialPages = (pages as any[]) ?? [];
      // partialId -> partial ids it contains (the denormalized closure column)
      const dependencies: Record<string, string[]> = {};
      partialPages.forEach((page: any) => {
        dependencies[page.id] = ((page.partialBlocks as string) ?? "").split("|").filter(Boolean);
      });

      // Nesting rules: the partial chain below any page is capped at
      // MAX_PARTIAL_DEPTH. Editing a partial means candidates land at
      // (levels above it + 1) already, shrinking the depth budget.
      const editingPartial = pageId ? pageId in dependencies : false;
      const chainAbove = editingPartial ? 1 + getPartialUsageDepth(pageId!, dependencies) : 0;
      const allowedTargetDepth = MAX_PARTIAL_DEPTH - chainAbove;

      if (editingPartial && allowedTargetDepth < 1) {
        return {
          partials: {},
          note:
            "This partial is already used inside another partial, so it sits at the maximum nesting depth " +
            `(${MAX_PARTIAL_DEPTH} levels). No partial blocks can be added here — tell the user why.`,
        };
      }

      const result: Record<string, { name?: string; description?: string; type?: string }> = {};
      partialPages.forEach((page: any) => {
        // Never offer the page being edited (self-nesting), anything that
        // contains it (cycle), or partials whose subtree is too deep to fit.
        if (pageId && page.id === pageId) return;
        if (pageId && dependencies[page.id]!.includes(pageId)) return;
        if (getPartialDepth(page.id, dependencies) > allowedTargetDepth) return;
        const meta = (page.metadata as any) ?? {};
        result[page.id] = {
          name: page.name,
          description: meta.description ?? "",
          type: page.pageType ?? "partial",
        };
      });
      return {
        partials: result,
        ...(editingPartial
          ? {
              note: `You are editing a partial: only partials that fit within the maximum nesting depth (${MAX_PARTIAL_DEPTH} levels) are listed.`,
            }
          : {}),
      };
    },
  }),

  get_pages_list: buildGetPagesListTool(),
});

/**
 * Tools for a block-scoped run (the block floating AI action).
 *
 * The model is handed *only* read + edit for the one selected block (plus the
 * read-only get_pages_list lookup), so a
 * page-wide edit is not something it can express: add_blocks, remove_blocks,
 * add_custom_block is absent from the tool set entirely, and
 * read_block_html/edit_block refuse any bid other than the scoped one.
 * Prompt wording alone is not enough here — the tool surface is the boundary.
 */
const buildBlockScopedAiEditPageTools = ({
  pageHtml,
  scopedBlockId,
  dataBindingPaths,
}: {
  pageHtml: string;
  scopedBlockId: string;
  dataBindingPaths?: AiDataBindingPaths;
}) => {
  const outOfScope = (blockId: string) =>
    `ERROR: bid "${blockId}" is outside the current edit scope. Only the selected block "${scopedBlockId}" ` +
    `may be read or edited in this conversation.`;

  return {
    read_block_html: tool({
      description:
        `Read the full current HTML of the selected block "${scopedBlockId}". ` +
        "ALWAYS call this before edit_block — never guess the block's markup. " +
        "Only this block may be read; other bids are rejected.",
      inputSchema: zodSchema(
        z.object({
          blockIds: z.array(z.string()).min(1).describe(`must be exactly ["${scopedBlockId}"]`),
        }),
      ),
      execute: async ({ blockIds }: { blockIds: string[] }) => {
        const rejected = blockIds.filter((id) => id !== scopedBlockId);
        if (rejected.length > 0) {
          return Object.fromEntries(rejected.map((id) => [id, outOfScope(id)]));
        }
        return extractBlockHtmlSlices(pageHtml, [scopedBlockId]);
      },
    }),

    edit_block: tool({
      description:
        `Replace the selected block "${scopedBlockId}" with new HTML. The html must be the complete replacement ` +
        "for that element, and must not alter anything outside it. Call read_block_html first.",
      inputSchema: zodSchema(
        z.object({
          task: z.string().describe("Short user-facing progress label, e.g. 'Rewriting heading copy'"),
          blockId: z.string().describe(`must be "${scopedBlockId}"`),
          html: z.string().describe("Full replacement HTML for the selected block"),
        }),
      ),
    }),
    bind_prop: buildBindPropTool({ dataBindingPaths, scopedBlockId }),
    get_pages_list: buildGetPagesListTool(),
  };
};

export const buildAiEditPageTools = ({
  pageHtml,
  scopedBlockId,
  pageId,
  dataBindingPaths,
}: {
  pageHtml: string;
  scopedBlockId?: string;
  pageId?: string;
  dataBindingPaths?: AiDataBindingPaths;
}) =>
  scopedBlockId
    ? buildBlockScopedAiEditPageTools({ pageHtml, scopedBlockId, dataBindingPaths })
    : buildAllAiEditPageTools({ pageHtml, pageId, dataBindingPaths });

export type AiEditPageTools = ReturnType<typeof buildAllAiEditPageTools>;
export type AiEditPageToolName = keyof AiEditPageTools;

/** Tools the client must execute (no server execute()). */
export const CLIENT_EXECUTED_AI_EDIT_TOOLS = [
  "edit_block",
  "add_blocks",
  "remove_blocks",
  "add_custom_block",
  "bind_prop",
] as const;
