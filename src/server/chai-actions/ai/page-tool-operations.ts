import { pick } from "lodash-es";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { ActionError } from "~/server/chai-actions/action-error";
import { getAppRow } from "~/server/chai-actions/apps/app-store";
import { getConfigSiteSettingsTransform } from "~/server/defaults/config-registry";
import {
  chaiDesignSystemPatchShape,
  designSystemStatus,
  mergeChaiDesignSystem,
  missingDesignSystemSections,
  readChaiDesignSystem,
  type ChaiDesignSystemPatch,
} from "~/server/chai-actions/ai/design-system-schema";
import { chaiThemePatchSchema } from "~/server/chai-actions/website/theme-patch";
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import type { ChaiBlock } from "~/types/common";
import { CHAI_DESIGN_SYSTEM_KEY, type ChaiDesignSystem } from "~/types/design-system";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";
import type { ChaiDesignTokens } from "~/types/types";
import {
  filterFindingsToBlocks,
  formatDesignFindings,
  runDesignChecks,
  type ChaiDesignCheckContext,
} from "~/utils/design-checks";
import { collectSubtreeIds } from "~/utils/blocks-tree-ops";
import { blocksToAiHtml } from "~/utils/export-html/blocks-to-ai-html";
import { extractBlockHtmlSlices } from "~/utils/export-html/extract-block-html-slices";
import { isPartialPageTypeKey, type PageTypeCandidate } from "~/utils/page-type-helpers";
import { collectTranslations, type TranslationEntry } from "~/utils/page-translations";
import { getPartialDepth, getPartialUsageDepth } from "~/utils/partial-nesting";
import { formatZodIssues } from "./design-system-schema";

/**
 * Shared single-page AI/MCP operations over `ChaiBlock[]` JSON, site settings,
 * design system, SEO, translations, and partials.
 *
 * Both Builder AI (`ai-edit-page-tools.ts`) and MCP (`src/plugins/mcp/server/tools/*`)
 * delegate to these functions so behavior stays identical across surfaces.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/**
 * Render only the requested root block subtrees from `ChaiBlock[]` JSON and slice by bid.
 * Mirrors MCP `read_block_html` exactly so Builder AI and MCP produce identical HTML.
 */
export function sliceBlocksHtml(blocks: ChaiBlock[], blockIds: string[]): Record<string, string> {
  const requested = new Set(blockIds);
  const byId = new Map(blocks.map((b) => [b._id, b]));
  const hasRequestedAncestor = (id: string): boolean => {
    const seen = new Set<string>();
    let parent = byId.get(id)?._parent ?? null;
    while (parent && !seen.has(parent)) {
      if (requested.has(parent)) return true;
      seen.add(parent);
      parent = byId.get(parent)?._parent ?? null;
    }
    return false;
  };
  const rootIds = blockIds.filter((id) => byId.has(id) && !hasRequestedAncestor(id));
  const pageHtml = blocksToAiHtml(blocks, rootIds);
  return extractBlockHtmlSlices(pageHtml, blockIds);
}

/**
 * Return raw `ChaiBlock` JSON slices by bid, optionally including every descendant
 * in document order. Shared by Builder AI and MCP `read_blocks`.
 */
export function sliceBlocksJson(
  blocks: ChaiBlock[],
  blockIds: string[],
  options: { includeDescendants?: boolean } = {},
): { blocks: ChaiBlock[]; missingIds: string[] } {
  const byId = new Map(blocks.map((block) => [block._id, block]));
  const foundIds: string[] = [];
  const missingIds: string[] = [];
  for (const id of blockIds) {
    if (byId.has(id)) {
      foundIds.push(id);
    } else if (!missingIds.includes(id)) {
      missingIds.push(id);
    }
  }
  const targetIds = options.includeDescendants ? collectSubtreeIds(blocks, foundIds) : new Set(foundIds);
  return {
    blocks: blocks.filter((block) => targetIds.has(block._id)),
    missingIds,
  };
}

export const MAX_TRANSLATION_ENTRIES = 150;

export function buildBlockTranslationsPage(
  blocks: ChaiBlock[],
  lang: string,
  options: { blockIds?: string[]; missingOnly?: boolean; offset?: number } = {},
): { total: number; nextOffset: number | null; entries: TranslationEntry[] } {
  const offset = Math.max(0, Number(options.offset) || 0);
  const all = collectTranslations(blocks, lang, {
    blockIds: options.blockIds,
    missingOnly: Boolean(options.missingOnly),
  });
  const entries = all.slice(offset, offset + MAX_TRANSLATION_ENTRIES);
  const nextOffset = offset + MAX_TRANSLATION_ENTRIES < all.length ? offset + MAX_TRANSLATION_ENTRIES : null;
  return { total: all.length, nextOffset, entries };
}

export type PartialPageRow = {
  id: string;
  name?: string | null;
  slug?: string | null;
  pageType?: string | null;
  metadata?: unknown;
  partialBlocks?: string | null;
};

export type PartialBlockSummary = {
  name?: string;
  description?: string;
  type?: string;
  tags: string[];
};

/**
 * Filter site pages down to valid partial blocks (verified by registered pageType),
 * including `tags`, and optionally enforcing self-nesting / cycle / `MAX_PARTIAL_DEPTH`
 * rules when `currentPageId` is provided.
 */
export function selectPartialBlocks(
  pages: PartialPageRow[],
  pageTypes: PageTypeCandidate[],
  options: { currentPageId?: string } = {},
): { partials: Record<string, PartialBlockSummary>; note?: string } {
  const partialPages = (pages ?? []).filter(
    (page) => (page.slug ?? "") === "" && isPartialPageTypeKey(page.pageType, pageTypes),
  );

  const dependencies: Record<string, string[]> = {};
  for (const page of partialPages) {
    dependencies[page.id] = (page.partialBlocks ?? "").split("|").filter(Boolean);
  }

  const pageId = options.currentPageId;
  const editingPartial = Boolean(pageId && pageId in dependencies);
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

  const result: Record<string, PartialBlockSummary> = {};
  for (const page of partialPages) {
    if (pageId) {
      if (page.id === pageId) continue;
      if (dependencies[page.id]!.includes(pageId)) continue;
      if (getPartialDepth(page.id, dependencies) > allowedTargetDepth) continue;
    }
    const meta = asRecord(page.metadata);
    const rawTags = meta[PARTIAL_TAGS_METADATA_KEY];
    result[page.id] = {
      name: page.name ?? undefined,
      description: typeof meta.description === "string" ? meta.description : "",
      type: page.pageType ?? "partial",
      tags: Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === "string") : [],
    };
  }

  if (editingPartial) {
    return {
      partials: result,
      note: `You are editing a partial: only partials that fit within the maximum nesting depth (${MAX_PARTIAL_DEPTH} levels) are listed.`,
    };
  }

  return { partials: result };
}

/** @internal */
export type SiteDesignContext = {
  name: string;
  theme: Partial<ChaiTheme> | null;
  designTokens: ChaiDesignTokens;
  /** The raw site AI context (`apps.ai`). */
  ai: Record<string, unknown>;
  designSystem: ChaiDesignSystem | null;
};

export function toSiteDesignContext(settings: Record<string, unknown> | null | undefined): SiteDesignContext | null {
  if (!settings || !isRecord(settings)) return null;
  const ai = asRecord(settings.ai);
  return {
    name: typeof settings.name === "string" ? settings.name : "",
    theme: isRecord(settings.theme) ? (settings.theme as Partial<ChaiTheme>) : null,
    designTokens: isRecord(settings.designTokens) ? (settings.designTokens as ChaiDesignTokens) : {},
    ai,
    designSystem: readChaiDesignSystem(ai[CHAI_DESIGN_SYSTEM_KEY]),
  };
}

export type AppSiteDesignContext = SiteDesignContext & {
  fallbackLang: string;
  languages: string[];
};

/**
 * Read the full draft `apps` row (including `name`, `ai`, `theme`, `designTokens`,
 * `fallbackLang`, `languages`) after applying the host's `transformSiteSettings` hook —
 * mirroring MCP's `cb.getSiteSettings()` without stripping `ai`/`name` like `GetWebsiteSettingsAction`.
 */
export async function readSiteDesignContextForApp(appId: string): Promise<AppSiteDesignContext | null> {
  try {
    const { data: appRow, error } = await getAppRow(appId, { draft: true });
    if (error || !appRow) return null;
    const transform = getConfigSiteSettingsTransform();
    const transformed = (transform ? await transform(appRow, { appId, draftMode: true }) : appRow) as Record<
      string,
      unknown
    >;
    const base = toSiteDesignContext(transformed);
    if (!base) return null;
    return {
      ...base,
      fallbackLang: typeof transformed.fallbackLang === "string" ? transformed.fallbackLang : "",
      languages: Array.isArray(transformed.languages) ? (transformed.languages as string[]) : [],
    };
  } catch {
    return null;
  }
}

export function toDesignCheckContext(
  site: SiteDesignContext,
  options: { isPartial?: boolean; includeTheme?: boolean } = {},
): ChaiDesignCheckContext {
  const bannedWords = site.ai.bannedWords;
  return {
    theme: options.includeTheme ? site.theme : null,
    designTokens: site.designTokens,
    bannedWords:
      typeof bannedWords === "string" || Array.isArray(bannedWords) ? (bannedWords as string | string[]) : null,
    isPartial: options.isPartial,
  };
}

/** The given blocks and everything inside them. */
export { collectSubtreeIds };

const MAX_CHECK_LISTED = 40;

export function runPageDesignCheckReport(
  blocks: ChaiBlock[],
  ctx: ChaiDesignCheckContext,
  options: { pageName: string; blockIds?: string[]; active: boolean; outlineHint?: string },
):
  | { ok: true; text: string; errors: number; warnings: number }
  | { ok: false; message: string } {
  let findings = runDesignChecks(blocks, ctx);
  const requested = Array.isArray(options.blockIds) ? options.blockIds : [];
  if (requested.length) {
    const known = new Set(blocks.map((block) => block._id));
    const missing = requested.filter((id) => !known.has(id));
    if (missing.length === requested.length) {
      const hint = options.outlineHint ?? "Call get_page_outline for valid bids.";
      return {
        ok: false,
        message: `Error: No block with bid ${missing.join(", ")} on "${options.pageName}". ${hint}`,
      };
    }
    findings = filterFindingsToBlocks(findings, collectSubtreeIds(blocks, requested));
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  const scope = requested.length ? ` (blocks ${requested.join(", ")} and what is inside them)` : "";
  const lines = [
    `### Design check: "${options.pageName}"${scope}`,
    findings.length ? `- ${errors} error(s), ${warnings} warning(s).` : "- No findings.",
    options.active
      ? "- The site's design system is enabled: fix every error before asking to publish; keep a warning only when it is deliberate."
      : "- The site has no enabled design system: these are general quality checks, to act on as the user wants.",
  ];
  if (findings.length) lines.push("", formatDesignFindings(findings, MAX_CHECK_LISTED));
  lines.push("", "A clean check is evidence, not proof: look at the preview as well.");
  return { ok: true, text: lines.join("\n"), errors, warnings };
}

export const DESIGN_SYSTEM_PATCH_KEYS = Object.keys(chaiDesignSystemPatchShape) as Array<keyof ChaiDesignSystemPatch>;

export function extractDesignSystemPatch(args: Record<string, unknown>): ChaiDesignSystemPatch {
  return pick(args, DESIGN_SYSTEM_PATCH_KEYS) as ChaiDesignSystemPatch;
}

export function designSystemStatusLine(ds: ChaiDesignSystem): string {
  const status = designSystemStatus(ds);
  const missing = missingDesignSystemSections(ds);
  const sections = missing.length
    ? ` Sections not written yet: ${missing.join(", ")}.`
    : " All eight sections are written.";
  if (status === "disabled") {
    return `- Status: saved, NOT enabled. Nothing is enforced until the user confirms enabling it; then call save_design_system with enabled: true.${sections}`;
  }
  return `- Status: enabled. Every page now follows it; read it with get_design_system before building.${sections}`;
}

const SAVE_ATTEMPTS = 3;
const isConflict = (err: unknown) => err instanceof ActionError && err.code === "CONFLICT";

export type SiteDesignSaveResult = { ok: true; next: ChaiDesignSystem | null } | { ok: false; message: string };

/**
 * Shared CAS read-patch-write for `apps.ai.designSystem` + product keys.
 */
export async function saveSiteDesignContextWithCas(
  patch: ChaiDesignSystemPatch,
  product: Record<string, unknown>,
  options: {
    touchesSystem: boolean;
    replace: boolean;
    userId?: string;
    source: "mcp" | "builder";
    readContext: () => Promise<{ aiData?: { app?: unknown } }>;
    saveContext: (payload: Record<string, unknown>) => Promise<unknown>;
    formatError: (err: unknown) => string;
  },
): Promise<SiteDesignSaveResult> {
  for (let attempt = 1; ; attempt++) {
    let stored: unknown = null;
    let next: ChaiDesignSystem | null = null;
    if (options.touchesSystem) {
      try {
        const context = await options.readContext();
        stored = asRecord(context?.aiData?.app)[CHAI_DESIGN_SYSTEM_KEY] ?? null;
      } catch (err) {
        return { ok: false, message: `Error: Could not read the site's AI settings (${options.formatError(err)})` };
      }
      const merged = mergeChaiDesignSystem(readChaiDesignSystem(stored), patch, {
        replace: options.replace,
        updatedBy: options.userId,
        source: options.source,
      });
      if (!merged.ok) return { ok: false, message: `Error: ${merged.message}` };
      next = merged.next;
    }

    const siteData = { ...(next ? { [CHAI_DESIGN_SYSTEM_KEY]: next } : {}), ...product };
    if (Object.keys(siteData).length === 0) return { ok: true, next };
    try {
      await options.saveContext({
        type: "app",
        merge: true,
        aiData: siteData,
        ...(options.touchesSystem ? { expectedDesign: stored } : {}),
      });
      return { ok: true, next };
    } catch (err) {
      if (options.touchesSystem && isConflict(err) && attempt < SAVE_ATTEMPTS) continue;
      return { ok: false, message: `Error: Could not save (${options.formatError(err)})` };
    }
  }
}

export type UpdateThemeActionResult = { changed: string[]; weakContrast: string[] };

export async function executeUpdateSiteThemePatch(
  args: Record<string, unknown>,
  deps: {
    updateTheme: (patch: Record<string, unknown>) => Promise<UpdateThemeActionResult>;
    formatError: (err: unknown) => string;
    publishHint?: string;
  },
): Promise<{ ok: true; text: string; changed: string[] } | { ok: false; message: string }> {
  const parsed = chaiThemePatchSchema.safeParse({
    ...(args.fontFamily !== undefined ? { fontFamily: args.fontFamily } : {}),
    ...(args.borderRadius !== undefined ? { borderRadius: args.borderRadius } : {}),
    ...(args.colors !== undefined ? { colors: args.colors } : {}),
  });
  if (!parsed.success) return { ok: false, message: `Error: ${formatZodIssues(parsed.error)}` };
  const patch = parsed.data;
  if (
    !patch.fontFamily?.heading &&
    !patch.fontFamily?.body &&
    !patch.borderRadius &&
    !Object.keys(patch.colors ?? {}).length
  ) {
    return { ok: false, message: "Error: nothing to change. Pass fontFamily, borderRadius or colors." };
  }

  let result: UpdateThemeActionResult;
  try {
    result = await deps.updateTheme(patch as Record<string, unknown>);
  } catch (err) {
    return { ok: false, message: `Error: Could not update the theme (${deps.formatError(err)})` };
  }
  if (result.changed.length === 0) {
    return { ok: true, text: "Nothing changed: the theme already has these values.", changed: [] };
  }

  const weak = result.weakContrast ?? [];
  const lines = [
    "### Theme draft updated",
    `- Changed: ${result.changed.join(", ")}.`,
    ...(weak.length ? [`- ⚠️ Below 4.5:1 (fine for large text only): ${weak.join("; ")}.`] : []),
    deps.publishHint ??
      "- Page previews use the new theme now. The live site keeps the old one until the user approves publish_site_theme.",
  ];
  return { ok: true, text: lines.join("\n"), changed: result.changed };
}

export type UpdateTokensActionResult = { updated: Array<{ id: string; name: string; value: string }> };

export async function executeUpdateDesignTokensPatch(
  args: Record<string, unknown>,
  deps: {
    updateTokens: (tokens: unknown) => Promise<UpdateTokensActionResult>;
    formatError: (err: unknown) => string;
    publishHint?: string;
  },
): Promise<{ ok: true; text: string; updatedIds: string[] } | { ok: false; message: string }> {
  let result: UpdateTokensActionResult;
  try {
    result = await deps.updateTokens(args.tokens);
  } catch (err) {
    return { ok: false, message: `Error: Could not update the design tokens (${deps.formatError(err)})` };
  }

  return {
    ok: true,
    updatedIds: result.updated.map((token) => token.id),
    text: [
      "### Design tokens draft updated",
      ...result.updated.map((token) => `- ${token.id} (${token.name}): ${token.value}`),
      deps.publishHint ??
        "- Every block using these tokens shows the change in previews now. The live site keeps the old values until the user approves publish_site_theme.",
    ].join("\n"),
  };
}

export type LibraryDescriptor = {
  id: string;
  name?: string | null;
};

export type LibraryItemDescriptor = {
  id: string;
  name?: string | null;
  group?: string | null;
  description?: string | null;
  library?: string | null;
};

export type NormalizedLibraryBlock = {
  id: string;
  name: string;
  group: string;
  description: string | null;
  libraryId: string;
  libraryName: string;
};

const MAX_LIBRARY_BLOCKS_LISTED = 100;

/**
 * List available library blocks across every library registered for this site,
 * deduplicated by block id and filtered by optional `group` and `query`.
 * Shared by Builder AI and MCP `get_library_blocks`.
 */
export async function listAvailableLibraryBlocks(
  deps: {
    getLibraries: () => Promise<LibraryDescriptor[]>;
    getLibraryItems: (libraryId: string) => Promise<LibraryItemDescriptor[]>;
  },
  options: { query?: string; group?: string } = {},
): Promise<{
  blocks: NormalizedLibraryBlock[];
  groups: string[];
  total: number;
  truncated: boolean;
}> {
  const libraries = (await deps.getLibraries()) ?? [];
  const itemLists = await Promise.all(
    libraries.map(async (library) => {
      try {
        const items = (await deps.getLibraryItems(library.id)) ?? [];
        return { library, items };
      } catch {
        return { library, items: [] as LibraryItemDescriptor[] };
      }
    }),
  );

  const seen = new Set<string>();
  const all: NormalizedLibraryBlock[] = [];
  for (const { library, items } of itemLists) {
    const libraryName = library.name?.trim() || library.id;
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      all.push({
        id: item.id,
        name: item.name?.trim() || item.id,
        group: item.group?.trim() || "general",
        description: item.description?.trim() || null,
        libraryId: item.library?.trim() || library.id,
        libraryName,
      });
    }
  }

  const groups = Array.from(new Set(all.map((b) => b.group))).sort((a, b) => a.localeCompare(b));
  const groupFilter = options.group?.trim().toLowerCase() ?? "";
  const queryFilter = options.query?.trim().toLowerCase() ?? "";

  const filtered = all.filter((block) => {
    if (groupFilter && !block.group.toLowerCase().includes(groupFilter)) return false;
    if (queryFilter) {
      const haystack = `${block.name} ${block.group} ${block.description ?? ""} ${block.id}`.toLowerCase();
      if (!haystack.includes(queryFilter)) return false;
    }
    return true;
  });

  const truncated = filtered.length > MAX_LIBRARY_BLOCKS_LISTED;
  return {
    blocks: truncated ? filtered.slice(0, MAX_LIBRARY_BLOCKS_LISTED) : filtered,
    groups,
    total: filtered.length,
    truncated,
  };
}
