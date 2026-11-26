import { convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { z } from "zod";
import { buildPageOutlineForAi } from "~/builder/pages/panels/ai-panel/page-outline-for-ai";
import { AI_OMITTED_HTML_SENTINEL } from "~/constants/AI_TOOL_HISTORY";
import { getRegisteredChaiFonts } from "~/registry";
import { throwAiChatError } from "~/server/chai-actions/ai/throw-ai-chat-error";
import { AIChatError, AIChatErrorCode } from "~/server/chai-actions/classes/chai-ai-chat-handler";
import { getEditPageToolsSystemPrompt } from "~/server/chai-actions/classes/system-prompt/edit-page-tools-system-prompt";
import { runChaiAction } from "~/server/chai-actions/dispatch-action";
import { resolveEffectivePermissions } from "~/server/rbac/effective-permissions";
import { hasChaiPermission } from "~/server/rbac/permissions";
import type { ChaiBlock } from "~/types/common";
import { CHAI_DESIGN_SYSTEM_KEY, CHAI_PAGE_DESIGN_BRIEF_KEY } from "~/types/design-system";
import { describePageLang, getPageLangInfo } from "~/utils/page-lang";
import { toLanguageView } from "~/utils/page-translations";
import { ChaiAIActionData, ChaiBaseAiAction } from "../../base-ai-action";
import { composeDesignBrief } from "../design/compose-design-brief";
import { getDesignSystemFeature } from "../design/feature";
import { isDesignSystemActive, readChaiDesignSystem, readChaiPageDesignBrief } from "../design-system-schema";
import { readSiteDesignContextForApp } from "../page-tool-operations";
import { fillAiEditSystemPromptContext } from "./ai-edit-page-prompt-context";
import { buildAiEditPageTools } from "./ai-edit-page-tools";

const designTokensSchema = z
  .record(
    z.string(),
    z.object({
      name: z.string(),
      value: z.string(),
      description: z.string().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .optional();

/** Keep model context bounded across long conversations. */
const MAX_HISTORY_MESSAGES = 12;

type AIEditPageActionData = Omit<ChaiAIActionData, "messages"> & {
  messages: UIMessage[];
  /** Current open page's blocks JSON (preferred — mirrors MCP's JSON state). */
  blocks?: ChaiBlock[];
  /** Legacy fallback HTML string when `blocks` is not provided. */
  pageHtml?: string;
  pageOutline?: string;
  /** Active page row id (language variant row id on a variant, primary id on primary). */
  pageId?: string;
  /** Primary page id (defaults to `pageId`). */
  primaryPageId?: string;
  pageName?: string;
  pageSlug?: string;
  /** Active language code ("" or fallbackLang on primary page, e.g. "fr" on variant). */
  lang?: string;
  fallbackLang?: string;
  /** Non-fallback languages configured for this page / site. */
  variantLangs?: string[];
  /** All configured non-fallback languages on the site. */
  languages?: string[];
  isPartial?: boolean;
  /** Set by the block floating AI action: confine the whole run to this bid. */
  scopedBlockId?: string;
};

export type AIEditPageStreamResponse = {
  _streamingResponse: true;
  _streamResult: { isDataStream: true; dataStream: Response };
};

/**
 * Strip large tool inputs/outputs from all but the last assistant message so
 * multi-turn conversations and auto-continue steps stay compact. Current page
 * state is always readable via read_block_html / get_page_blocks.
 */
const PRUNED_OUTPUT_TOOLS = new Set([
  "tool-get_page_blocks",
  "tool-read_blocks",
  "tool-read_block_html",
  "tool-get_block_translations",
]);

const pruneHistoryToolInputs = (messages: UIMessage[]): UIMessage[] => {
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === "assistant");
  return messages.map((message, index) => {
    if (message.role !== "assistant" || index === lastAssistantIndex || !Array.isArray(message.parts)) {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part: any) => {
        if (typeof part?.type !== "string") return part;
        if ((part.type === "tool-edit_block" || part.type === "tool-add_blocks") && part.input?.html) {
          return { ...part, input: { ...part.input, html: AI_OMITTED_HTML_SENTINEL } };
        }
        if (PRUNED_OUTPUT_TOOLS.has(part.type) && part.state === "output-available" && part.output !== undefined) {
          return { ...part, output: { omitted: true, note: "Previous output omitted; re-read if needed." } };
        }
        return part;
      }),
    };
  });
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Action to handle AI_EDIT_PAGE requests.
 *
 * Streams an AI SDK v6 UIMessage response driven by single-page tools synced
 * with MCP: operates on `blocks: ChaiBlock[]` JSON (falling back to legacy
 * `pageHtml` only when `blocks` is omitted), converts blocks to AI-HTML on
 * demand via `blocksToAiHtml`, supports language-variant views, SEO, media
 * uploads, and opt-in design system briefs/checks/theme tools.
 */
export class AIEditPageAction extends ChaiBaseAiAction<AIEditPageActionData, AIEditPageStreamResponse> {
  protected getValidationSchema() {
    return z.object({
      messages: z.array(z.any()).min(1),
      model: z.string().optional(),
      context: z.any().optional(),
      designTokens: designTokensSchema,
      blocks: z.array(z.any()).optional(),
      pageHtml: z.string().optional(),
      pageOutline: z.string().optional(),
      pageId: z.string().optional(),
      primaryPageId: z.string().optional(),
      pageName: z.string().optional(),
      pageSlug: z.string().optional(),
      lang: z.string().optional(),
      fallbackLang: z.string().optional(),
      variantLangs: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      isPartial: z.boolean().optional(),
      scopedBlockId: z.string().optional(),
      options: z.any().optional(),
    });
  }

  private resolveCallerPermissions(): string[] | null | undefined {
    const granted = this.context?.userAccess?.permissions;
    if (granted === undefined) return undefined;
    if (granted === null) return null;
    const delegated = this.context?.delegatedPermissions;
    return delegated ? resolveEffectivePermissions(granted, delegated) : granted;
  }

  private async resolveActiveDesignBriefSection(
    data: AIEditPageActionData,
    permissions: string[] | null | undefined,
  ): Promise<string> {
    const feature = getDesignSystemFeature();
    if (!feature.enabled) return "";
    if (permissions !== undefined && (!permissions || !hasChaiPermission(permissions, "ai:read"))) return "";

    try {
      const appId = this.context?.appId;
      if (!appId) return "";
      const targetPrimaryPageId = data.primaryPageId ?? data.pageId;
      const [site, aiContext] = await Promise.all([
        readSiteDesignContextForApp(appId),
        runChaiAction("AI_GET_CONTEXT", targetPrimaryPageId ? { pageId: targetPrimaryPageId } : {})
          .then((res) => res as { aiData?: { app?: unknown; page?: unknown } })
          .catch(() => null),
      ]);
      const app = asRecord(aiContext?.aiData?.app ?? site?.ai);
      const pageAi = asRecord(aiContext?.aiData?.page);
      const designSystem = readChaiDesignSystem(app[CHAI_DESIGN_SYSTEM_KEY]) ?? site?.designSystem ?? null;
      const pageBrief = readChaiPageDesignBrief(pageAi[CHAI_PAGE_DESIGN_BRIEF_KEY]);

      // Only inject into the base prompt when the site design system is active or a page brief exists;
      // otherwise the model keeps default styling rules and can call `get_design_system` on demand.
      if (!isDesignSystemActive(feature, designSystem) && !pageBrief) return "";

      return composeDesignBrief({
        siteName: site?.name,
        designSystem,
        product: app,
        theme: site?.theme ?? null,
        designTokens: site?.designTokens ?? data.designTokens ?? {},
        fonts: getRegisteredChaiFonts().map((font) => font.family),
        page: targetPrimaryPageId
          ? { name: data.pageName || "Current Page", slug: data.pageSlug || "", brief: pageBrief }
          : null,
        checks: feature.designChecks,
      });
    } catch {
      return "";
    }
  }

  async execute(data: AIEditPageActionData): Promise<AIEditPageStreamResponse> {
    if (!this.context) {
      throwAiChatError(new AIChatError("Context not set. Please try again.", AIChatErrorCode.INVALID_REQUEST, 500));
    }

    if (!data.messages || data.messages.length === 0) {
      throwAiChatError(
        new AIChatError("No messages provided. Please enter a prompt.", AIChatErrorCode.INVALID_REQUEST, 400),
      );
    }

    const scopedBlockId = data.scopedBlockId;
    const permissions = this.resolveCallerPermissions();
    const langInfo = getPageLangInfo({ lang: data.lang, fallbackLang: data.fallbackLang });

    // On a language variant, present that language's view for outline, read_block_html, and design checks.
    const rawBlocks = Array.isArray(data.blocks) ? (data.blocks as ChaiBlock[]) : undefined;
    const viewBlocks =
      rawBlocks && langInfo.isLanguageVariant ? toLanguageView(rawBlocks, langInfo.lang) : rawBlocks;

    const initiator = scopedBlockId ? "block" : "page";
    const tools = await this.resolveActionTools(
      buildAiEditPageTools({
        blocks: rawBlocks,
        pageHtml: data.pageHtml ?? "",
        scopedBlockId,
        pageId: data.pageId,
        primaryPageId: data.primaryPageId,
        pageName: data.pageName,
        pageSlug: data.pageSlug,
        lang: data.lang,
        fallbackLang: data.fallbackLang,
        variantLangs: data.variantLangs,
        languages: data.languages,
        isPartial: data.isPartial,
        dataBindingPaths: data.options?.dataBindingPaths,
        permissions,
        userId: this.context.userId,
      }),
      { initiator, data },
    );

    const outlineText =
      viewBlocks !== undefined
        ? buildPageOutlineForAi(viewBlocks).trim() || "The page is currently empty."
        : data.pageOutline?.trim() || "The page is currently empty.";

    let systemPrompt = getEditPageToolsSystemPrompt({
      animation: data?.options?.animation,
      activeTools: new Set(Object.keys(tools)),
    });
    systemPrompt = systemPrompt.replace("{{PAGE_OUTLINE}}", () => outlineText);
    systemPrompt = fillAiEditSystemPromptContext(systemPrompt, data);

    const langNote = describePageLang(langInfo);
    if (langNote) {
      systemPrompt += `\n\n## Current Page Language\n${langNote}`;
      if (!langInfo.isLanguageVariant && data.variantLangs && data.variantLangs.length > 0) {
        systemPrompt += `\nThis page has language variants: ${data.variantLangs.join(", ")}. When copy changes, follow any "Translations to sync" list returned by edit tools using update_block_translations.`;
      }
    }

    const designBriefSection = await this.resolveActiveDesignBriefSection(data, permissions);
    if (designBriefSection) {
      systemPrompt += `\n\n${designBriefSection}`;
    }

    if (scopedBlockId) {
      systemPrompt +=
        `\n\n## Edit Scope: Single Block (STRICT)\n` +
        `You are editing ONLY the block with bid "${scopedBlockId}". The page outline above is read-only context.\n` +
        `- The ONLY block you may read, replace, or data-bind is "${scopedBlockId}".\n` +
        `- You cannot add, remove, or reorder blocks, and you cannot touch any other block on the page.\n` +
        `- Keep every change inside that block's markup. Do not alter its surroundings, siblings, or parents.\n` +
        `- If the request cannot be satisfied within this one block, say so and explain that the user should use ` +
        `the AI panel in the sidebar for page-wide changes. Do not attempt a partial workaround elsewhere.`;
    } else {
      const lastUserMessage = [...data.messages].reverse().find((m) => m.role === "user");
      const selectedBlockId = (lastUserMessage?.metadata as { selectedBlockId?: string } | undefined)?.selectedBlockId;
      if (selectedBlockId) {
        systemPrompt +=
          `\n\n## Currently Selected Block\nThe user currently has the block with bid "${selectedBlockId}" selected. ` +
          "Prioritize changes to this block unless the request explicitly requires broader changes.";
      }
    }

    const history = pruneHistoryToolInputs(data.messages.slice(-MAX_HISTORY_MESSAGES));
    const messages = await convertToModelMessages(history, { ignoreIncompleteToolCalls: true });

    systemPrompt = await this.resolveSystemPrompt(systemPrompt, { initiator, data });

    return this.streamChaiBuilderUIMessageResponse({
      model: data.model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      tools,
      stopWhen: stepCountIs(20),
    });
  }
}
