import { tool, zodSchema } from "ai";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getRegisteredChaiFonts } from "~/registry";
import { getChaiActionInstance } from "~/server/chai-actions/actions-registery";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { runChaiAction } from "~/server/chai-actions/dispatch-action";
import { applyChaiActionCacheEffects } from "~/server/chai-builder/action-cache-effects";
import { getInitializedStateWithUser } from "~/server/chai-builder/state";
import { getResolvedPageTypes } from "~/server/defaults/config-registry";
import { toSafeChaiMcpError } from "~/server/mcp/response";
import { hasChaiPermission } from "~/server/rbac/permissions";
import type { ChaiBlock } from "~/types/common";
import { CHAI_DESIGN_SYSTEM_KEY, CHAI_PAGE_DESIGN_BRIEF_KEY, type ChaiPageDesignBrief } from "~/types/design-system";
import { extractBlockHtmlSlices } from "~/utils/export-html/extract-block-html-slices";
import { getLinkablePages, toPageLinkRef } from "~/utils/internal-link-refs";
import { getPageLangInfo, langLabel, langResponseFields } from "~/utils/page-lang";
import { describeSeoPageLang, isPlainRecord, mergeSeoUpdate, normalizeStoredSeo, parseSeoPatch } from "~/utils/page-seo";
import { toLanguageView } from "~/utils/page-translations";
import { composeDesignBrief } from "../design/compose-design-brief";
import { getDesignSystemFeature } from "../design/feature";
import { DESIGN_GUIDES, getDesignGuide, type DesignGuideTopic } from "../design/guides";
import {
  designSystemStatus,
  isDesignSystemActive,
  readChaiDesignSystem,
  readChaiPageDesignBrief,
} from "../design-system-schema";
import {
  buildBlockTranslationsPage,
  collectSubtreeIds,
  designSystemStatusLine,
  extractDesignSystemPatch,
  listAvailableLibraryBlocks,
  readSiteDesignContextForApp,
  runPageDesignCheckReport,
  saveSiteDesignContextWithCas,
  selectPartialBlocks,
  sliceBlocksHtml,
  sliceBlocksJson,
  toDesignCheckContext,
  type AppSiteDesignContext,
  type LibraryDescriptor,
  type LibraryItemDescriptor,
} from "../page-tool-operations";
import { executeUploadImage, type CreatedAsset } from "../remote-image";
import { isValidAiBindingTemplate } from "./ai-edit-executors";
import type { AiDataBindingPaths } from "./ai-edit-page-prompt-context";
import {
  AI_EDIT_TOOL_DESCRIPTIONS,
  AI_SHARED_TOOL_PERMISSIONS,
  SHARED_AI_TOOL_FIELDS,
} from "./ai-edit-tool-contract";

export { extractBlockHtmlSlices, isValidAiBindingTemplate };

export type BuildAiEditPageToolsOptions = {
  /** Current page blocks JSON (preferred — mirrors MCP). */
  blocks?: ChaiBlock[];
  /** Legacy fallback HTML string when `blocks` is omitted. */
  pageHtml?: string;
  scopedBlockId?: string;
  /** Active page row id (language variant row id when editing a variant). */
  pageId?: string;
  /** Primary page id (same as pageId on primary pages). */
  primaryPageId?: string;
  pageName?: string;
  pageSlug?: string;
  /** Active content language (variant lang, or "" / fallbackLang on primary). */
  lang?: string;
  fallbackLang?: string;
  /** Variant languages configured for this page. */
  variantLangs?: string[];
  /** All configured non-fallback languages on the site. */
  languages?: string[];
  isPartial?: boolean;
  dataBindingPaths?: AiDataBindingPaths;
  /**
   * Caller's effective RBAC permissions. When provided, every tool is checked against
   * `AI_SHARED_TOOL_PERMISSIONS`; when omitted (direct unit tests), base tools stay enabled.
   */
  permissions?: readonly string[] | null;
  /** Current userId for authorship stamps (e.g. `save_design_system`). */
  userId?: string;
};

const fields = SHARED_AI_TOOL_FIELDS;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const formatErr = (err: unknown): string => toSafeChaiMcpError(err).replace(/^Error: /, "");

const hasToolPermissions = (permissions: readonly string[] | null | undefined, toolName: string): boolean => {
  if (permissions === undefined) return true;
  if (permissions === null) return false;
  const required = AI_SHARED_TOOL_PERMISSIONS[toolName] ?? [];
  return required.every((perm) => hasChaiPermission(permissions as string[], perm));
};

async function runActionWithCache<TResult = unknown>(name: string, input: unknown): Promise<TResult> {
  const result = (await runChaiAction(name, input)) as TResult;
  try {
    await applyChaiActionCacheEffects(name, result);
  } catch (error) {
    console.error(`[chai-ai] cache invalidation failed after ${name}:`, error);
  }
  return result;
}

async function readSiteDesignContextViaAction(): Promise<AppSiteDesignContext | null> {
  try {
    const { appId } = getInitializedStateWithUser();
    return await readSiteDesignContextForApp(appId);
  } catch {
    return null;
  }
}

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

const buildGetPagesListTool = () =>
  tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.get_pages_list,
    inputSchema: zodSchema(z.object(fields.get_pages_list)),
    execute: async ({ mode = "draft" }: { mode?: "draft" | "live" }) => {
      const { appId } = getInitializedStateWithUser();
      const pagesTable = mode === "live" ? schema.appPagesOnline : schema.appPages;
      const whereTerms = [eq(pagesTable.app, appId), ne(pagesTable.slug, "")];
      if (mode === "draft") whereTerms.push(isNull(schema.appPages.deletedAt));

      const { data: pages, error } = await safeQuery(() =>
        db
          .select({
            id: pagesTable.id,
            name: pagesTable.name,
            slug: pagesTable.slug,
            lang: pagesTable.lang,
            pageType: pagesTable.pageType,
            primaryPage: pagesTable.primaryPage,
            parent: pagesTable.parent,
            dynamic: pagesTable.dynamic,
          })
          .from(pagesTable)
          .where(and(...whereTerms))
          .orderBy(asc(pagesTable.slug)),
      );

      if (error) {
        throw new Error(`Failed to fetch pages: ${error.message}`);
      }

      const site = await readSiteDesignContextForApp(appId);
      const fallbackLang = site?.fallbackLang ?? "";
      const languages = site?.languages ?? [];

      const rows = (pages as any[]) ?? [];
      const slugById = new Map(rows.map((p) => [p.id, p.slug]));
      const linkableIds = new Set(getLinkablePages(rows).map((p) => p.id));

      return {
        fallbackLang,
        languages,
        pages: rows
          .filter((page) => linkableIds.has(page.id))
          .map((page) => ({
            id: page.id,
            name: page.name,
            slug: page.slug,
            lang: page.lang || fallbackLang,
            pageType: page.pageType ?? "page",
            parentId: page.parent ?? null,
            parentSlug: page.parent ? (slugById.get(page.parent) ?? null) : null,
            linkRef: toPageLinkRef(page),
          })),
        note: "Use linkRef as the href when linking to a page. Never write the slug — slugs change, a linkRef does not.",
      };
    },
  });

const buildUpdateBlockTranslationsTool = (scopedBlockId?: string, scopedIds?: ReadonlySet<string>) =>
  tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.update_block_translations,
    inputSchema: zodSchema(
      z
        .object({
          task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Updating French translations'"),
          lang: fields.update_block_translations.lang,
          // AI SDK zodSchema() adds additionalProperties:false to z.record(), so use string/array/null
          // (objects can be passed as JSON strings and are parsed client-side).
          translations: z
            .array(
              z.object({
                blockId: z.string().describe("bid of the block"),
                prop: z.string().describe('Translatable prop name as reported by get_block_translations, e.g. "content"'),
                value: z
                  .union([z.string(), z.array(z.unknown()), z.null()])
                  .describe(
                    'Translated value (string for copy including HTML markup, JSON string for object props, or array). null or "" removes the translation so the source shows.',
                  ),
              }),
            )
            .min(1)
            .max(500)
            .describe("Translations to write; the whole batch is rejected if any entry is invalid."),
        })
        .superRefine((input, context) => {
          if (!scopedBlockId) return;
          for (const [index, entry] of input.translations.entries()) {
            const allowed = scopedIds ? scopedIds.has(entry.blockId) : entry.blockId === scopedBlockId;
            if (!allowed) {
              context.addIssue({
                code: "custom",
                path: ["translations", index, "blockId"],
                message: `Only block "${scopedBlockId}" and its descendants may be translated in this conversation`,
              });
            }
          }
        }),
    ),
  });

const buildGetBlockTranslationsTool = ({
  blocks,
  pageName,
  targetPrimaryPageId,
  langInfo,
  variantLangs,
  languages,
  scopedBlockId,
  scopedIds,
}: {
  blocks: ChaiBlock[];
  pageName: string;
  targetPrimaryPageId?: string;
  langInfo: ReturnType<typeof getPageLangInfo>;
  variantLangs: string[];
  languages: string[];
  scopedBlockId?: string;
  scopedIds?: ReadonlySet<string>;
}) =>
  tool({
    description: AI_EDIT_TOOL_DESCRIPTIONS.get_block_translations,
    inputSchema: zodSchema(z.object(fields.get_block_translations)),
    execute: async (args: { lang?: string; blockIds?: string[]; missingOnly?: boolean; offset?: number }) => {
      const site = await readSiteDesignContextViaAction();
      const configured = [...new Set([...languages, ...variantLangs, ...(site?.languages ?? [])])].filter(
        (code) => code && code !== langInfo.fallbackLang,
      );
      const knownNote = configured.length
        ? ` Configured translation languages: ${configured.map(langLabel).join(", ")}.`
        : " The site has no other languages configured.";

      const targetLang = (args.lang || (langInfo.isLanguageVariant ? langInfo.lang : "")).trim();
      if (!targetLang) {
        return { error: `Pass lang — the target language code.${knownNote}` };
      }
      if (targetLang === langInfo.fallbackLang) {
        return {
          error: `${langLabel(targetLang)} is the site fallback language; edit its copy directly with edit_block.${knownNote}`,
        };
      }
      if (configured.length > 0 && !configured.includes(targetLang)) {
        return { error: `${langLabel(targetLang)} is not a configured site language.${knownNote}` };
      }

      let requestedIds = args.blockIds;
      if (scopedBlockId && scopedIds) {
        if (requestedIds && requestedIds.length > 0) {
          const outOfScope = requestedIds.filter((id) => !scopedIds.has(id));
          if (outOfScope.length > 0) {
            return {
              error: `bid ${outOfScope.join(", ")} is outside the current edit scope "${scopedBlockId}".`,
            };
          }
        } else {
          requestedIds = [...scopedIds];
        }
      }

      const page = buildBlockTranslationsPage(blocks, targetLang, { ...args, blockIds: requestedIds });
      return {
        pageName,
        primaryPageId: targetPrimaryPageId ?? null,
        lang: targetLang,
        fallbackLang: langInfo.fallbackLang,
        languageVariantExists: variantLangs.includes(targetLang) || targetLang === langInfo.lang,
        ...page,
      };
    },
  });

const readSlicesFromInput = (
  viewBlocks: ChaiBlock[] | undefined,
  pageHtml: string,
  blockIds: string[],
): Record<string, string> => (viewBlocks ? sliceBlocksHtml(viewBlocks, blockIds) : extractBlockHtmlSlices(pageHtml, blockIds));

const buildBlockScopedAiEditPageTools = ({
  blocks,
  pageHtml = "",
  scopedBlockId,
  primaryPageId,
  pageId,
  pageName = "Current Page",
  lang,
  fallbackLang,
  variantLangs = [],
  languages = [],
  dataBindingPaths,
  permissions,
}: Required<Pick<BuildAiEditPageToolsOptions, "scopedBlockId">> & BuildAiEditPageToolsOptions) => {
  const outOfScope = (blockId: string) =>
    `ERROR: bid "${blockId}" is outside the current edit scope. Only the selected block "${scopedBlockId}" ` +
    `may be read or edited in this conversation.`;

  const langInfo = getPageLangInfo({ lang, fallbackLang });
  const viewBlocks = blocks && langInfo.isLanguageVariant ? toLanguageView(blocks, langInfo.lang) : blocks;
  const scopedIds = blocks ? collectSubtreeIds(blocks, [scopedBlockId]) : new Set([scopedBlockId]);
  const targetPrimaryPageId = primaryPageId ?? pageId;

  const tools: Record<string, any> = {
    read_blocks: tool({
      description:
        `Read the raw JSON of the selected block "${scopedBlockId}" (or its descendants when includeDescendants is true). ` +
        "Prefer this over read_block_html when updating props with update_block_props. Only this block and its descendants may be read.",
      inputSchema: zodSchema(
        z.object({
          blockIds: z.array(z.string()).min(1).describe(`bids within "${scopedBlockId}" and its descendants`),
          includeDescendants: fields.read_blocks.includeDescendants,
        }),
      ),
      execute: async ({ blockIds, includeDescendants }: { blockIds: string[]; includeDescendants?: boolean }) => {
        const rejected = blockIds.filter((id) => !scopedIds.has(id));
        if (rejected.length > 0) {
          return { ok: false, error: outOfScope(rejected[0]!) };
        }
        if (!viewBlocks) {
          return { ok: false, error: "Block JSON is unavailable for this request; call read_block_html instead." };
        }
        const { blocks: found, missingIds } = sliceBlocksJson(viewBlocks, blockIds, { includeDescendants });
        return {
          ...langResponseFields(langInfo),
          blocks: found,
          ...(missingIds.length > 0 ? { missingIds } : {}),
        };
      },
    }),

    update_block_props: tool({
      description:
        `Patch JSON props on the selected block "${scopedBlockId}" or its descendants without rewriting HTML. ` +
        "Preferred over edit_block for copy, style, media, link, and custom-block prop edits. Call read_blocks first.",
      inputSchema: zodSchema(
        z
          .object({
            task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Updating heading copy'"),
            ...fields.update_block_props,
          })
          .superRefine((input, context) => {
            for (const [index, entry] of input.updates.entries()) {
              if (!scopedIds.has(entry.blockId)) {
                context.addIssue({
                  code: "custom",
                  path: ["updates", index, "blockId"],
                  message: `Only block "${scopedBlockId}" and its descendants may be updated in this conversation`,
                });
              }
            }
          }),
      ),
    }),

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
        return readSlicesFromInput(viewBlocks, pageHtml, [scopedBlockId]);
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
  };

  if (hasToolPermissions(permissions, "get_pages_list")) {
    tools.get_pages_list = buildGetPagesListTool();
  }

  const hasMultilingual = Boolean(langInfo.isLanguageVariant || variantLangs.length > 0);
  if (hasMultilingual && blocks !== undefined && hasToolPermissions(permissions, "get_block_translations")) {
    tools.get_block_translations = buildGetBlockTranslationsTool({
      blocks,
      pageName,
      targetPrimaryPageId,
      langInfo,
      variantLangs,
      languages,
      scopedBlockId,
      scopedIds,
    });
  }
  if (hasMultilingual && hasToolPermissions(permissions, "update_block_translations")) {
    tools.update_block_translations = buildUpdateBlockTranslationsTool(scopedBlockId, scopedIds);
  }

  return tools;
};

const buildAllAiEditPageTools = (options: BuildAiEditPageToolsOptions) => {
  const {
    blocks,
    pageHtml = "",
    pageId,
    primaryPageId,
    pageName = "Current Page",
    pageSlug = "",
    lang,
    fallbackLang,
    variantLangs = [],
    languages = [],
    isPartial = false,
    dataBindingPaths,
    permissions,
    userId,
  } = options;

  const langInfo = getPageLangInfo({ lang, fallbackLang });
  const viewBlocks = blocks && langInfo.isLanguageVariant ? toLanguageView(blocks, langInfo.lang) : blocks;
  const targetPrimaryPageId = primaryPageId ?? pageId;
  const designFeature = getDesignSystemFeature();

  const tools: Record<string, any> = {
    read_blocks: tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.read_blocks,
      inputSchema: zodSchema(z.object(fields.read_blocks)),
      execute: async ({ blockIds, includeDescendants }: { blockIds: string[]; includeDescendants?: boolean }) => {
        if (!viewBlocks) {
          return { ok: false, error: "Block JSON is unavailable for this request; call read_block_html instead." };
        }
        const { blocks: found, missingIds } = sliceBlocksJson(viewBlocks, blockIds, { includeDescendants });
        return {
          ...langResponseFields(langInfo),
          blocks: found,
          ...(missingIds.length > 0 ? { missingIds } : {}),
        };
      },
    }),

    update_block_props: tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.update_block_props,
      inputSchema: zodSchema(
        z.object({
          task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Updating hero copy'"),
          ...fields.update_block_props,
        }),
      ),
    }),

    read_block_html: tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.read_block_html,
      inputSchema: zodSchema(
        z.object({
          blockIds: z.array(z.string()).min(1).describe("bids of the blocks to read"),
        }),
      ),
      execute: async ({ blockIds }: { blockIds: string[] }) => readSlicesFromInput(viewBlocks, pageHtml, blockIds),
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
  };

  if (viewBlocks !== undefined && hasToolPermissions(permissions, "get_page_blocks")) {
    tools.get_page_blocks = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.get_page_blocks,
      inputSchema: zodSchema(z.object(fields.get_page_blocks)),
      execute: async () => ({
        pageId: pageId ?? null,
        primaryPageId: targetPrimaryPageId ?? null,
        name: pageName,
        slug: pageSlug,
        ...langResponseFields(langInfo),
        blocks: viewBlocks,
      }),
    });
  }

  if (hasToolPermissions(permissions, "get_partial_blocks")) {
    tools.get_partial_blocks = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.get_partial_blocks,
      inputSchema: zodSchema(z.object(fields.get_partial_blocks)),
      execute: async () => {
        const { appId } = getInitializedStateWithUser();
        const { data: pages, error } = await safeQuery(() =>
          db
            .select({
              id: schema.appPages.id,
              name: schema.appPages.name,
              slug: schema.appPages.slug,
              metadata: schema.appPages.metadata,
              pageType: schema.appPages.pageType,
              partialBlocks: schema.appPages.partialBlocks,
            })
            .from(schema.appPages)
            .where(
              and(
                eq(schema.appPages.app, appId),
                eq(schema.appPages.slug, ""),
                eq(schema.appPages.lang, ""),
                isNull(schema.appPages.deletedAt),
              ),
            ),
        );

        if (error) {
          throw new Error(`Failed to fetch partial blocks: ${error.message}`);
        }

        return selectPartialBlocks((pages as any[]) ?? [], getResolvedPageTypes(), {
          currentPageId: targetPrimaryPageId,
        });
      },
    });
  }

  const hasLibraryActions = Boolean(
    getChaiActionInstance("GET_LIBRARIES") &&
      getChaiActionInstance("GET_LIBRARY_ITEMS") &&
      getChaiActionInstance("GET_LIBRARY_ITEM"),
  );
  if (hasLibraryActions && hasToolPermissions(permissions, "get_library_blocks")) {
    tools.get_library_blocks = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.get_library_blocks,
      inputSchema: zodSchema(z.object(fields.get_library_blocks)),
      execute: async (input: { query?: string; group?: string }) => {
        try {
          const result = await listAvailableLibraryBlocks(
            {
              getLibraries: () => runChaiAction("GET_LIBRARIES", {}) as Promise<LibraryDescriptor[]>,
              getLibraryItems: (id) => runChaiAction("GET_LIBRARY_ITEMS", { id }) as Promise<LibraryItemDescriptor[]>,
            },
            input,
          );
          if (result.blocks.length === 0) {
            return {
              ok: true,
              blocks: [],
              groups: result.groups,
              total: 0,
              note:
                result.groups.length > 0
                  ? `No library blocks matched. Available groups: ${result.groups.join(", ")}.`
                  : "No library blocks are available for this site.",
            };
          }
          return { ok: true, ...result };
        } catch (error) {
          return { ok: false, error: formatErr(error) };
        }
      },
    });
  }

  if (hasLibraryActions && hasToolPermissions(permissions, "add_library_block")) {
    tools.add_library_block = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.add_library_block,
      inputSchema: zodSchema(
        z.object({
          task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Adding hero section'"),
          ...fields.add_library_block,
        }),
      ),
    });
  }

  if (hasToolPermissions(permissions, "get_pages_list")) {
    tools.get_pages_list = buildGetPagesListTool();
  }

  // --- Multilingual tools (single page, active when page/site has translations) ---
  const hasMultilingual = Boolean(langInfo.isLanguageVariant || variantLangs.length > 0);
  if (hasMultilingual && blocks !== undefined && hasToolPermissions(permissions, "get_block_translations")) {
    tools.get_block_translations = buildGetBlockTranslationsTool({
      blocks,
      pageName,
      targetPrimaryPageId,
      langInfo,
      variantLangs,
      languages,
    });
  }

  if (hasMultilingual && hasToolPermissions(permissions, "update_block_translations")) {
    tools.update_block_translations = buildUpdateBlockTranslationsTool();
  }

  // --- SEO tools (single open non-partial page) ---
  if (pageId && !isPartial && hasToolPermissions(permissions, "get_page_seo")) {
    tools.get_page_seo = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.get_page_seo,
      inputSchema: zodSchema(z.object(fields.get_page_seo)),
      execute: async () => {
        const draft = (await runChaiAction("GET_DRAFT_PAGE", { id: pageId })) as { seo?: unknown };
        const normalized = normalizeStoredSeo(draft?.seo);
        return {
          pageId,
          primaryPageId: targetPrimaryPageId ?? pageId,
          name: pageName,
          slug: pageSlug,
          ...langResponseFields(langInfo),
          languageNote: describeSeoPageLang(langInfo),
          inheritsPrimaryJsonLD: langInfo.isLanguageVariant && normalized.jsonLD === null,
          ...normalized,
        };
      },
    });
  }

  if (pageId && !isPartial && hasToolPermissions(permissions, "update_page_seo")) {
    tools.update_page_seo = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.update_page_seo,
      inputSchema: zodSchema(
        z.object({
          task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Updating page SEO'"),
          title: fields.update_page_seo.title,
          description: fields.update_page_seo.description,
          canonicalUrl: fields.update_page_seo.canonicalUrl,
          noIndex: fields.update_page_seo.noIndex,
          noFollow: fields.update_page_seo.noFollow,
          ogTitle: fields.update_page_seo.ogTitle,
          ogDescription: fields.update_page_seo.ogDescription,
          ogImage: fields.update_page_seo.ogImage,
          // AI SDK zodSchema() adds additionalProperties:false to z.record(), so expose
          // metaOther as {name, content}[] and jsonLD as a JSON string | null for strict models.
          metaOther: z
            .array(z.object({ name: z.string(), content: z.string() }))
            .optional()
            .describe('Extra <meta name content> pairs. Replaces the whole set; pass [] to remove them all.'),
          jsonLD: z
            .union([z.string(), z.null()])
            .optional()
            .describe("JSON-LD document serialized as a JSON string. Replaces the whole document; null or '{}' clears it."),
        }),
      ),
      execute: async ({ task: _task, ...rawArgs }: Record<string, unknown>) => {
        const args: Record<string, unknown> = { ...rawArgs };
        if (Array.isArray(rawArgs.metaOther)) {
          const pairs: Record<string, string> = {};
          for (const entry of rawArgs.metaOther as Array<{ name?: unknown; content?: unknown }>) {
            if (typeof entry?.name === "string" && typeof entry?.content === "string") {
              pairs[entry.name] = entry.content;
            }
          }
          args.metaOther = pairs;
        }
        const parsed = parseSeoPatch(args);
        if (!parsed.ok) return { ok: false, error: parsed.message };
        let current: Record<string, unknown> = {};
        try {
          const draft = (await runChaiAction("GET_DRAFT_PAGE", { id: pageId })) as { seo?: unknown };
          if (isPlainRecord(draft?.seo)) current = draft.seo;
        } catch (err) {
          return { ok: false, error: `Failed to read current SEO (${formatErr(err)})` };
        }
        const { seo, changedKeys } = mergeSeoUpdate(current, parsed.patch);
        try {
          await runActionWithCache("UPDATE_PAGE", { id: pageId, seo, addInRevision: true });
        } catch (err) {
          return { ok: false, error: `Failed to update page SEO (${formatErr(err)})` };
        }
        return { ok: true, pageId, changedKeys };
      },
    });
  }

  // --- Media upload tool (when media backend is registered) ---
  if (getChaiActionInstance("CREATE_ASSET") && hasToolPermissions(permissions, "upload_image")) {
    tools.upload_image = tool({
      description: AI_EDIT_TOOL_DESCRIPTIONS.upload_image,
      inputSchema: zodSchema(
        z.object({
          task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Uploading image'"),
          ...fields.upload_image,
        }),
      ),
      execute: async ({ task: _task, ...args }: Record<string, unknown>) => {
        const result = await executeUploadImage(args, {
          createAsset: (payload) => runActionWithCache<CreatedAsset>("CREATE_ASSET", payload),
          getFallbackLang: async () => {
            if (langInfo.fallbackLang) return langInfo.fallbackLang;
            const site = await readSiteDesignContextViaAction();
            return site?.fallbackLang || "en";
          },
          formatError: formatErr,
        });
        if (!result.ok) return { ok: false, error: result.message };
        return {
          ok: true,
          url: result.asset.url,
          assetId: result.asset.id,
          width: result.asset.width,
          height: result.asset.height,
          summary: result.text,
        };
      },
    });
  }

  // --- Design system & theme tools (opt-in via designSystem feature) ---
  if (designFeature.enabled) {
    const hasAiContextActions =
      Boolean(getChaiActionInstance("AI_GET_CONTEXT")) && Boolean(getChaiActionInstance("AI_SAVE_CONTEXT"));

    if (hasAiContextActions && hasToolPermissions(permissions, "get_design_system")) {
      tools.get_design_system = tool({
        description: AI_EDIT_TOOL_DESCRIPTIONS.get_design_system,
        inputSchema: zodSchema(z.object(fields.get_design_system)),
        execute: async ({ includeTokenValues }: { includeTokenValues?: boolean }) => {
          const sitePromise = readSiteDesignContextViaAction();
          let context: { aiData?: { app?: unknown; page?: unknown } };
          try {
            context = (await runChaiAction(
              "AI_GET_CONTEXT",
              targetPrimaryPageId ? { pageId: targetPrimaryPageId } : {},
            )) as { aiData?: { app?: unknown; page?: unknown } };
          } catch (err) {
            return { ok: false, error: `Could not read the site's AI settings (${formatErr(err)})` };
          }
          const app = asRecord(context?.aiData?.app);
          const pageAi = asRecord(context?.aiData?.page);
          const designSystem = readChaiDesignSystem(app[CHAI_DESIGN_SYSTEM_KEY]);
          const site = await sitePromise;
          return {
            ok: true,
            status: designSystemStatus(designSystem),
            brief: composeDesignBrief({
              siteName: site?.name,
              designSystem,
              product: app,
              theme: site?.theme ?? null,
              designTokens: site?.designTokens ?? {},
              fonts: getRegisteredChaiFonts().map((font) => font.family),
              page: targetPrimaryPageId
                ? {
                    name: pageName,
                    slug: pageSlug,
                    brief: readChaiPageDesignBrief(pageAi[CHAI_PAGE_DESIGN_BRIEF_KEY]),
                  }
                : null,
              includeTokenValues: includeTokenValues === true,
              checks: designFeature.designChecks,
            }),
          };
        },
      });
    }

    if (hasAiContextActions && hasToolPermissions(permissions, "save_design_system")) {
      tools.save_design_system = tool({
        description: AI_EDIT_TOOL_DESCRIPTIONS.save_design_system,
        inputSchema: zodSchema(
          z.object({
            task: z.string().nullish().describe("Short user-facing progress label, e.g. 'Saving design system'"),
            ...fields.save_design_system,
          }),
        ),
        execute: async ({ task: _task, ...args }: Record<string, unknown>) => {
          const patch = extractDesignSystemPatch(args);
          const touchesSystem = Object.keys(patch).length > 0 || args.replace === true;
          const product = asRecord(args.product);
          const pageBrief = args.pageBrief as Omit<ChaiPageDesignBrief, "updatedAt"> | undefined;

          if (!touchesSystem && Object.keys(product).length === 0 && !pageBrief) {
            return { ok: false, error: "Nothing to save. Pass design-system fields, product, or pageBrief." };
          }
          if (pageBrief && !targetPrimaryPageId) {
            return { ok: false, error: "Cannot save pageBrief: no active page id." };
          }

          const site = await saveSiteDesignContextWithCas(patch, product, {
            touchesSystem,
            replace: args.replace === true,
            userId,
            source: "builder",
            readContext: () => runChaiAction("AI_GET_CONTEXT", {}) as Promise<{ aiData?: { app?: unknown } }>,
            saveContext: (payload) => runChaiAction("AI_SAVE_CONTEXT", payload),
            formatError: formatErr,
          });
          if (!site.ok) return { ok: false, error: site.message };

          if (pageBrief && targetPrimaryPageId) {
            try {
              await runChaiAction("AI_SAVE_CONTEXT", {
                type: "page",
                pageId: targetPrimaryPageId,
                merge: true,
                aiData: { designBrief: { ...pageBrief, updatedAt: new Date().toISOString() } },
              });
            } catch (err) {
              return { ok: false, error: `Could not save page brief (${formatErr(err)})` };
            }
          }

          const lines = ["### Saved"];
          if (site.next) lines.push(`- North star: ${site.next.northStar}`, designSystemStatusLine(site.next));
          if (Object.keys(product).length) lines.push(`- Site context updated: ${Object.keys(product).join(", ")}.`);
          if (pageBrief) lines.push(`- Page brief saved for "${pageName}" (${pageSlug || "partial"}).`);
          return { ok: true, summary: lines.join("\n") };
        },
      });
    }

    if (viewBlocks !== undefined && hasToolPermissions(permissions, "check_page_design")) {
      tools.check_page_design = tool({
        description: AI_EDIT_TOOL_DESCRIPTIONS.check_page_design,
        inputSchema: zodSchema(z.object(fields.check_page_design)),
        execute: async ({ blockIds }: { blockIds?: string[] }) => {
          const site = await readSiteDesignContextViaAction();
          const ctx = site ? toDesignCheckContext(site, { isPartial, includeTheme: true }) : { isPartial };
          const report = runPageDesignCheckReport(viewBlocks, ctx, {
            pageName,
            blockIds,
            active: isDesignSystemActive(designFeature, site?.designSystem),
            outlineHint: "Check the page outline for valid bids.",
          });
          if (!report.ok) return { ok: false, error: report.message };
          return { ok: true, errors: report.errors, warnings: report.warnings, report: report.text };
        },
      });
    }

    if (hasToolPermissions(permissions, "get_design_guide")) {
      tools.get_design_guide = tool({
        description: AI_EDIT_TOOL_DESCRIPTIONS.get_design_guide,
        inputSchema: zodSchema(z.object(fields.get_design_guide)),
        execute: async ({ topic }: { topic: DesignGuideTopic }) => {
          if (!Object.hasOwn(DESIGN_GUIDES, topic)) {
            return { ok: false, error: `Unknown topic "${String(topic)}". Topics: ${Object.keys(DESIGN_GUIDES).join(", ")}.` };
          }
          return { ok: true, topic, guide: getDesignGuide(topic) };
        },
      });
    }
  }

  return tools;
};

export const buildAiEditPageTools = (options: BuildAiEditPageToolsOptions) =>
  options.scopedBlockId
    ? buildBlockScopedAiEditPageTools({ ...options, scopedBlockId: options.scopedBlockId })
    : buildAllAiEditPageTools(options);

export type AiEditPageTools = ReturnType<typeof buildAllAiEditPageTools>;
export type AiEditPageToolName = keyof AiEditPageTools;

/** Tools the client must execute against the Jotai block store (no server execute()). */
export { CLIENT_EXECUTED_AI_EDIT_TOOLS } from "~/constants/AI_TOOL_HISTORY";
