import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatOnErrorCallback, ChatOnFinishCallback, ChatOnToolCallCallback, FileUIPart, UIMessage } from "ai";
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useAtomValue } from "jotai";
import { noop } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { chaiDesignTokensAtom, usePageExternalData } from "~/builder/atoms/builder";
import { getCurrentBlocks } from "~/builder/atoms/store";
import { canAddChildBlock, getHiddenBlockTypes } from "~/builder/core/functions/block-helpers";
import { useRegisteredChaiBlocks } from "~/registry";
import type { ChaiCanShowBlock } from "~/types/chaibuilder-editor-props";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBindProp } from "~/builder/hooks/use-bind-prop";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { partialBlocksListAtom, useCheckPartialCanAdd } from "~/builder/hooks/use-partial-blocks-store";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { useReplaceBlock } from "~/builder/hooks/use-replace-block";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useTheme } from "~/builder/hooks/use-theme";
import { AI_CREDITS_QUERY_KEY } from "~/builder/pages/constants/AI_CREDITS";
import { AI_CONTEXT_QUERY_KEY, useAiDesignContext, type BuilderAiDesignContext } from "~/builder/pages/hooks/ai/use-ai-context";
import { useChaiActivePage, usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useChaiApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { AI_OMITTED_HTML_SENTINEL, CLIENT_EXECUTED_AI_EDIT_TOOLS } from "~/constants/AI_TOOL_HISTORY";
import {
  applyAddBlocks,
  applyAddCustomBlock,
  applyAddLibraryBlocks,
  applyBindProp,
  applyEditBlock,
  applyRemoveBlocks,
  applyUpdateBlockProps,
  normalizeAiParentId,
  normalizeAiPosition,
  type BlockPropsUpdate,
} from "~/server/chai-actions/ai/ask-ai/ai-edit-executors";
import {
  isDesignSystemActive,
  readChaiDesignSystem,
  readChaiPageDesignBrief,
} from "~/server/chai-actions/ai/design-system-schema";
import type { ChaiBlock } from "~/types/common";
import {
  CHAI_DESIGN_SYSTEM_KEY,
  CHAI_PAGE_DESIGN_BRIEF_KEY,
  type ChaiDesignSystemFeature,
} from "~/types/design-system";
import { collectSubtreeIds } from "~/utils/blocks-tree-ops";
import { evaluateDesignCheckDiff } from "~/utils/design-checks";
import { buildInternalLinkResolver } from "~/utils/internal-link-refs";
import { langLabel } from "~/utils/page-lang";
import {
  applyTranslations,
  describeSeededFallbackCopy,
  describeTranslationSync,
  findChangedSourceProps,
  fromLanguageView,
  toLanguageView,
  type TranslationUpdate,
} from "~/utils/page-translations";
import { isPartialPageTypeKey } from "~/utils/page-type-helpers";
import { ACTIONS } from "../../constants/ACTIONS";
import { useAIConfig } from "./ai-models-context";
import { clearStreamCanvas, streamHtmlToCanvasForAdd, streamHtmlToCanvasForEdit } from "./canvas-stream-preview";
import { buildDataBindingPayload, buildPageOutlineForAi } from "./page-outline-for-ai";

/** Client-side cap on tool-call continuation round-trips per user message. */
const MAX_AUTO_CONTINUES = 5;

/**
 * Debounce for the per-section DB checkpoint. During a multi-section generation
 * we persist after each section lands, so a mid-run interruption (timeout, tab
 * close) keeps every completed section instead of losing the whole run.
 */
const CHECKPOINT_DEBOUNCE_MS = 800;

/** Client-executed tools handled by onToolCall (server-executed tools must be ignored there). */
const CLIENT_EXECUTED_TOOL_SET = new Set<string>(CLIENT_EXECUTED_AI_EDIT_TOOLS);

/** Server-executed mutating tools whose committed draft writes survive a client Stop(). */
const SERVER_MUTATING_TOOLS = new Set(["save_design_system", "update_page_seo"]);

export type AiPageChatToolOutput =
  | {
      ok: true;
      newBlockIds?: string[];
      outline?: string;
      skippedIds?: string[];
      designCheck?: string;
      translationsToSync?: string;
      seededFallbackBlockIds?: string[];
      seededFallbackNote?: string;
    }
  | { ok: false; error: string };

type SendPromptOptions = {
  model: string;
  files?: FileUIPart[];
  /**
   * Accepted for caller compatibility (empty-canvas auto-generation). No longer
   * gates saving: the page is now auto-saved after any run that edits it.
   */
  isAutoMode?: boolean;
  /** bid of the block the user has selected in the builder, if any. */
  selectedBlockId?: string;
  /** Raw prompt shown in the chat when the sent text is an enhanced version. */
  displayText?: string;
};

export type AiPageChatMessageMetadata = {
  selectedBlockId?: string;
  displayText?: string;
  /** True when prompt came from empty-page AI_AUTO_MODE kickstart. */
  isAutoMode?: boolean;
  /** Server-set on the finished assistant message — see base-ai-action.ts's messageMetadata. */
  totalTokens?: number;
};

type UseAiPageChatOptions = {
  onFinish?: (options: { message: UIMessage; isAbort: boolean; isError: boolean }) => void;
  onError?: (error: Error) => void;
  /**
   * Confine the conversation to a single block (block floating AI). Only
   * edit_block / bind_prop / update_block_translations on this bid are allowed.
   */
  scopedBlockId?: string;
};

const toolInput = (input: unknown): Record<string, any> => (input && typeof input === "object" ? (input as any) : {});

const normalizeSiteUrl = (domain: string | undefined): string | undefined => {
  if (!domain) return undefined;
  const trimmed = domain.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("//")) return `https:${trimmed}`.replace(/\/+$/, "");
  return `https://${trimmed}`.replace(/\/+$/, "");
};

/**
 * Live-preview parent resolution: the streamed html isn't parsed into blocks
 * yet, so we can't run full nesting rules — instead walk up past any target
 * that can't take children at all (e.g. PartialBlock), so the preview never
 * paints inside a childless block.
 */
const resolvePreviewParentId = (parentId: string | undefined): { parentId: string | undefined; changed: boolean } => {
  const allBlocks = getCurrentBlocks();
  let currentId = parentId;
  while (currentId) {
    const block = allBlocks.find((b) => b._id === currentId);
    if (!block) return { parentId: currentId, changed: false };
    if (canAddChildBlock(block._type)) return { parentId: currentId, changed: currentId !== parentId };
    currentId = block._parent as string | undefined;
  }
  return { parentId: undefined, changed: parentId !== undefined };
};

/** Parse a ChaiActionFailure JSON body thrown by the chat transport, if any. */
export const parseChatTransportError = (
  error: Error | undefined,
): { message: string; code?: string; status?: number; metadata?: Record<string, unknown> } | null => {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && parsed.ok === false && parsed.error) {
      return {
        message: parsed.error.message,
        code: parsed.error.code,
        status: parsed.error.status,
        metadata: parsed.error.metadata,
      };
    }
  } catch {
    /* not a JSON action failure */
  }
  return { message: error.message };
};

/**
 * Chat hook for the AI page-edit panel, built on AI SDK v6 useChat.
 *
 * Synced with MCP:
 * - Sends `blocks: ChaiBlock[]` JSON directly from the Jotai store (no iframe
 *   DOM scraping and no canvas repaint sleep).
 * - Executes client tools (`edit_block`, `add_blocks`, `remove_blocks`,
 *   `add_custom_block`, `bind_prop`, `update_block_translations`) on `ChaiBlock[]`
 *   JSON, including language-variant `toLanguageView`/`fromLanguageView` mapping,
 *   primary-edit `translationsToSync` detection, and write-time `runDesignChecks`.
 * - Syncs builder caches after server tools mutate SEO or design system.
 */
type UseAiPageChatResult = Omit<UseChatHelpers<UIMessage>, "stop"> & {
  sendPrompt: (prompt: string, options: SendPromptOptions) => Promise<void>;
  stop: () => Promise<{ reverted: boolean; serverMutationsCommitted: boolean }>;
  isLoading: boolean;
};

export const useAiPageChat = ({ onFinish, onError, scopedBlockId }: UseAiPageChatOptions = {}): UseAiPageChatResult => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const getAccessToken = usePagesProp("getAccessToken", noop);
  const beforeRequest = usePagesProp("beforeRequest", noop);
  const logout = usePagesProp("onLogout", noop);
  const config = useAIConfig();
  const isAnimationEnabled = useBuilderProp("flags.animation", false);
  const designSystemFeature = useBuilderProp("flags.designSystem", undefined) as ChaiDesignSystemFeature | undefined;
  const domain = usePagesProp("domain", "");
  const [chaiTheme] = useTheme();
  const designTokens = useAtomValue(chaiDesignTokensAtom);
  const pageExternalData = usePageExternalData();
  const dataBindingPaths = useMemo(() => buildDataBindingPayload(pageExternalData), [pageExternalData]);
  const { data: currentPage } = usePrimaryPage();
  const { data: activePage } = useChaiActivePage();
  const { data: languagePages } = useChaiLanguagePages();
  const { data: pageTypes } = useChaiPageTypes();
  const { languages: siteLanguages, selectedLang, fallbackLang } = useLanguages();
  const { data: designContext } = useAiDesignContext();
  const queryClient = useQueryClient();
  const { savePageAsync } = useChaiSavePage();
  const syncedToolCallIdsRef = useRef<Set<string>>(new Set());
  const syncedDesignSaveIdsRef = useRef<Set<string>>(new Set());
  const latestMessagesRef = useRef<UIMessage[]>([]);

  const { addBlocks, setNewBlocks, updateMultipleBlocksProps } = useBlocksStoreUndoableActions();
  const replaceBlock = useReplaceBlock();
  const removeBlocks = useRemoveBlocks();
  const bindProp = useBindProp();
  const partialBlocksList = useAtomValue(partialBlocksListAtom);
  const checkPartialCanAdd = useCheckPartialCanAdd();
  const { data: websitePages } = useChaiPrimaryPages();
  const registeredBlocks = useRegisteredChaiBlocks();
  const canShowBlock = useBuilderProp<ChaiCanShowBlock | undefined>("canShowBlock", undefined);
  const hiddenBlockTypes = useMemo(
    () => getHiddenBlockTypes(registeredBlocks, currentPage?.pageType || "page", canShowBlock),
    [registeredBlocks, currentPage?.pageType, canShowBlock],
  );

  const isPartial = useMemo(
    () => isPartialPageTypeKey(currentPage?.pageType, (pageTypes as any[]) ?? []),
    [currentPage?.pageType, pageTypes],
  );

  const isLanguageVariant = Boolean(selectedLang && fallbackLang && selectedLang !== fallbackLang);

  const variantLangs = useMemo(() => {
    const primaryId = currentPage?.id;
    if (!primaryId || !Array.isArray(languagePages)) return [];
    const langs = languagePages
      .filter((page: any) => page?.primaryPage === primaryId && page?.lang && page.lang !== fallbackLang)
      .map((page: any) => String(page.lang));
    return [...new Set(langs)].sort();
  }, [currentPage?.id, languagePages, fallbackLang]);

  const linkablePages = useMemo(() => {
    const byId = new Map<string, any>();
    for (const page of (websitePages as any[]) ?? []) {
      if (page?.id) byId.set(page.id, page);
    }
    for (const page of (languagePages as any[]) ?? []) {
      if (page?.id) byId.set(page.id, page);
    }
    return [...byId.values()];
  }, [websitePages, languagePages]);

  const aiEditExecutorOptions = useMemo(
    () => ({
      partialBlockNames: Object.fromEntries(
        Object.entries(partialBlocksList).map(([id, partial]) => [id, partial.name]),
      ),
      validatePartialReference: (partialBlockId: string): string | null => {
        const { canAdd, reason } = checkPartialCanAdd(partialBlockId);
        return canAdd ? null : reason || "This partial block cannot be added to this page";
      },
      resolveInternalLink: buildInternalLinkResolver(linkablePages, { siteUrl: normalizeSiteUrl(domain) }),
      hiddenBlockTypes,
    }),
    [checkPartialCanAdd, hiddenBlockTypes, partialBlocksList, linkablePages, domain],
  );

  const configuredTranslationLangs = useMemo(
    () =>
      [...new Set([...(siteLanguages ?? []), ...variantLangs])].filter(
        (code): code is string => Boolean(code) && code !== fallbackLang,
      ),
    [siteLanguages, variantLangs, fallbackLang],
  );

  const runClientDesignCheck = useCallback(
    async (beforeBlocks: ChaiBlock[], afterBlocks: ChaiBlock[]) => {
      if (!designSystemFeature?.enabled || designSystemFeature.designChecks === "off") {
        return { status: "skipped" as const, note: "" };
      }

      // Check if save_design_system committed during this turn before the query cache refreshed.
      let hasUnsyncedDesignSave = false;
      const latestAssistant = [...latestMessagesRef.current].reverse().find((m) => m.role === "assistant");
      const unsyncedSaveIds: string[] = [];
      if (Array.isArray(latestAssistant?.parts)) {
        for (const part of latestAssistant.parts as any[]) {
          if (
            isToolUIPart(part) &&
            part.type === "tool-save_design_system" &&
            part.state === "output-available" &&
            !(part.output && typeof part.output === "object" && (part.output as any).ok === false) &&
            part.toolCallId &&
            !syncedDesignSaveIdsRef.current.has(part.toolCallId)
          ) {
            hasUnsyncedDesignSave = true;
            unsyncedSaveIds.push(part.toolCallId);
          }
        }
      }

      let resolvedContext: BuilderAiDesignContext | undefined = designContext;
      const pageIdForContext = activePage?.id ?? currentPage?.id;
      if ((resolvedContext === undefined || hasUnsyncedDesignSave) && pageIdForContext) {
        try {
          const fresh = (await fetchAPI(apiUrl, {
            action: ACTIONS.AI_GET_CONTEXT,
            data: { pageId: pageIdForContext },
          })) as { success?: boolean; aiData?: { app?: any; page?: any } } | null;
          if (fresh?.success && fresh.aiData) {
            const raw = { app: fresh.aiData.app, page: fresh.aiData.page };
            queryClient.setQueryData([AI_CONTEXT_QUERY_KEY, activePage?.id], raw);
            const app = raw.app && typeof raw.app === "object" ? (raw.app as Record<string, unknown>) : {};
            const page = raw.page && typeof raw.page === "object" ? (raw.page as Record<string, unknown>) : {};
            const bannedWords = app.bannedWords;
            resolvedContext = {
              designSystem: readChaiDesignSystem(app[CHAI_DESIGN_SYSTEM_KEY]),
              designBrief: readChaiPageDesignBrief(page[CHAI_PAGE_DESIGN_BRIEF_KEY]),
              bannedWords:
                typeof bannedWords === "string" || Array.isArray(bannedWords)
                  ? (bannedWords as string | string[])
                  : null,
            };
            for (const id of unsyncedSaveIds) syncedDesignSaveIdsRef.current.add(id);
          }
        } catch {
          /* handled below */
        }
      }

      if (resolvedContext === undefined) {
        if (designSystemFeature.designChecks === "strict") {
          return {
            status: "rejected" as const,
            reject: "Error: Could not verify the site's design system in strict mode; nothing was saved.",
            errors: 1,
            warnings: 0,
          };
        }
        return { status: "skipped" as const, note: "" };
      }

      if (!isDesignSystemActive(designSystemFeature, resolvedContext.designSystem)) {
        return { status: "skipped" as const, note: "" };
      }

      const [checkBefore, checkAfter] = isLanguageVariant
        ? [toLanguageView(beforeBlocks, selectedLang), toLanguageView(afterBlocks, selectedLang)]
        : [beforeBlocks, afterBlocks];
      return evaluateDesignCheckDiff(
        checkBefore,
        checkAfter,
        {
          theme: chaiTheme as any,
          designTokens,
          bannedWords: resolvedContext.bannedWords ?? null,
          isPartial,
        },
        designSystemFeature.designChecks,
      );
    },
    [
      activePage?.id,
      apiUrl,
      chaiTheme,
      currentPage?.id,
      designContext,
      designSystemFeature,
      designTokens,
      fetchAPI,
      isLanguageVariant,
      isPartial,
      queryClient,
      selectedLang,
    ],
  );

  const syncServerToolSideEffects = useCallback(
    async (message: UIMessage) => {
      if (!Array.isArray(message.parts)) return;
      const completedTools = new Set<string>();
      for (const part of message.parts as any[]) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue;
        if (part.output && typeof part.output === "object" && (part.output as any).ok === false) continue;
        const callId = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (callId && syncedToolCallIdsRef.current.has(callId)) continue;
        const toolName = String(part.type).replace(/^tool-/, "");
        if (!SERVER_MUTATING_TOOLS.has(toolName)) continue;
        if (callId) syncedToolCallIdsRef.current.add(callId);
        completedTools.add(toolName);
      }
      if (completedTools.size === 0) return;

      if (completedTools.has("save_design_system")) {
        queryClient.invalidateQueries({ queryKey: [AI_CONTEXT_QUERY_KEY] });
      }
      if (completedTools.has("update_page_seo")) {
        queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_WEBSITE_PAGES] });
        queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_LANGUAGE_PAGES] });
        queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_CHANGES], refetchType: "all" });
      }
    },
    [queryClient],
  );

  /**
   * Everything prepareSendMessagesRequest needs, kept in a ref so the
   * transport (created once) always reads fresh values — including on
   * automatic tool-result continuations.
   */
  const requestContextRef = useRef<{ model: string; buildData: () => Record<string, any> }>({
    model: "",
    buildData: () => ({}),
  });

  requestContextRef.current.buildData = () => {
    const blocks = getCurrentBlocks();
    const viewBlocks = isLanguageVariant ? toLanguageView(blocks, selectedLang) : blocks;
    // Never fall back to the primary page id on a language variant: while language pages
    // load (or if no variant row exists), passing primaryPageId as pageId would cause
    // update_page_seo to overwrite the primary language's SEO.
    const activePageId = isLanguageVariant
      ? activePage?.id && activePage.id !== currentPage?.id
        ? activePage.id
        : undefined
      : (activePage?.id ?? currentPage?.id ?? undefined);
    return {
      model: requestContextRef.current.model || undefined,
      context: config.context,
      designTokens,
      blocks,
      pageOutline: buildPageOutlineForAi(viewBlocks),
      pageId: activePageId,
      primaryPageId: currentPage?.id ?? undefined,
      pageName: activePage?.name ?? currentPage?.name ?? undefined,
      pageSlug: activePage?.slug ?? currentPage?.slug ?? undefined,
      lang: selectedLang || fallbackLang || undefined,
      fallbackLang: fallbackLang || undefined,
      variantLangs,
      languages: configuredTranslationLangs,
      isPartial,
      scopedBlockId,
      options: {
        animation: isAnimationEnabled,
        dataBindingPaths,
        pageType: currentPage?.pageType ?? undefined,
        hiddenBlockTypes,
      },
    };
  };

  const autoContinuesRef = useRef(0);
  const hitContinueLimitRef = useRef(false);
  const preSendBlocksRef = useRef<ChaiBlock[] | null>(null);
  const isStoppedRef = useRef(false);
  const pageModifiedByAiRef = useRef(false);
  const pendingToolCallRef = useRef<Promise<void> | null>(null);
  const checkpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCheckpoint = useCallback(() => {
    if (checkpointTimerRef.current) {
      clearTimeout(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }
  }, []);

  const scheduleCheckpoint = useCallback(() => {
    if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = setTimeout(() => {
      checkpointTimerRef.current = null;
      if (!isStoppedRef.current && pageModifiedByAiRef.current) savePageAsync(true).catch(noop);
    }, CHECKPOINT_DEBOUNCE_MS);
  }, [savePageAsync]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: apiUrl,
        prepareSendMessagesRequest: async ({ messages, api }) => {
          let requestData: Record<string, any> = { messages, ...requestContextRef.current.buildData() };

          if (beforeRequest) {
            try {
              const result = await beforeRequest({ action: ACTIONS.AI_EDIT_PAGE, data: requestData });
              if (result && typeof result === "object" && "data" in result) {
                requestData = result.data;
              }
            } catch (error) {
              console.error("Error in beforeRequest hook:", error);
            }
          }

          const authToken = await getAccessToken();
          return {
            api: `${api}?action=${ACTIONS.AI_EDIT_PAGE.toLowerCase()}`,
            headers: { Authorization: `Bearer ${authToken}` },
            body: { action: ACTIONS.AI_EDIT_PAGE, data: requestData },
          };
        },
      }),
    [apiUrl],
  );

  const addToolOutputRef =
    useRef<(args: { tool: any; toolCallId: string; output: AiPageChatToolOutput }) => void>(noop);

  const executeToolCall = useCallback(
    async (toolName: string, input: Record<string, any>): Promise<AiPageChatToolOutput> => {
      if (scopedBlockId) {
        if (
          toolName !== "update_block_props" &&
          toolName !== "edit_block" &&
          toolName !== "bind_prop" &&
          toolName !== "update_block_translations"
        ) {
          return {
            ok: false,
            error: `${toolName} is not available here — this conversation can only edit, bind, or translate the selected block "${scopedBlockId}".`,
          };
        }
        if (
          toolName !== "update_block_translations" &&
          toolName !== "update_block_props" &&
          input.blockId !== scopedBlockId
        ) {
          return {
            ok: false,
            error: `Cannot edit block "${input.blockId}" — only the selected block "${scopedBlockId}" may be edited here.`,
          };
        }
      }

      if (typeof input.html === "string" && input.html.includes(AI_OMITTED_HTML_SENTINEL)) {
        clearStreamCanvas();
        return {
          ok: false,
          error:
            "That html is a placeholder from earlier context, not real markup. " +
            "Call read_block_html to fetch the current HTML, then send the complete markup.",
        };
      }

      const buildPostWriteNotes = (
        beforeBlocks: ChaiBlock[],
        afterBlocks: ChaiBlock[],
        designNote: string,
        seededFallbackBlockIds: string[] = [],
      ) => {
        const translationsToSync =
          !isLanguageVariant && variantLangs.length > 0
            ? describeTranslationSync(findChangedSourceProps(beforeBlocks, afterBlocks, variantLangs), variantLangs)
            : "";
        const seededFallbackNote =
          isLanguageVariant && seededFallbackBlockIds.length > 0
            ? describeSeededFallbackCopy(seededFallbackBlockIds, selectedLang, fallbackLang)
            : "";
        return {
          ...(designNote ? { designCheck: designNote } : {}),
          ...(translationsToSync ? { translationsToSync } : {}),
          ...(seededFallbackBlockIds.length > 0 ? { seededFallbackBlockIds } : {}),
          ...(seededFallbackNote ? { seededFallbackNote } : {}),
        };
      };

      switch (toolName) {
        case "update_block_props": {
          const updates = input.updates as BlockPropsUpdate[] | undefined;
          if (!Array.isArray(updates) || updates.length === 0) {
            return { ok: false, error: "update_block_props requires a non-empty updates array" };
          }
          const beforeBlocks = getCurrentBlocks();
          if (scopedBlockId) {
            const scopedIds = collectSubtreeIds(beforeBlocks, [scopedBlockId]);
            const foreign = updates.find((entry) => !scopedIds.has(entry?.blockId));
            if (foreign) {
              return {
                ok: false,
                error: `Cannot update block "${foreign.blockId}" — only the selected block "${scopedBlockId}" and its descendants may be updated here.`,
              };
            }
          }
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = applyUpdateBlockProps(workingBlocks, updates, aiEditExecutorOptions);
          if ("error" in result) return { ok: false, error: result.error };
          const mapped = isLanguageVariant
            ? fromLanguageView(beforeBlocks, result.blocks, selectedLang)
            : { blocks: result.blocks, seededFallbackBlockIds: [] as string[] };
          const designCheck = await runClientDesignCheck(beforeBlocks, mapped.blocks);
          if (designCheck.status === "rejected") {
            return { ok: false, error: designCheck.reject };
          }
          if (isLanguageVariant) {
            setNewBlocks(mapped.blocks);
          } else {
            updateMultipleBlocksProps(result.updatedBlocks ?? []);
          }
          return {
            ok: true,
            newBlockIds: result.updatedBlockIds,
            ...buildPostWriteNotes(beforeBlocks, mapped.blocks, designCheck.note, mapped.seededFallbackBlockIds),
          };
        }

        case "edit_block": {
          const { blockId, html } = input;
          if (!blockId || !html) return { ok: false, error: "edit_block requires blockId and html" };
          const beforeBlocks = getCurrentBlocks();
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = await applyEditBlock(workingBlocks, blockId, html, aiEditExecutorOptions);
          if ("error" in result) {
            clearStreamCanvas();
            return { ok: false, error: result.error };
          }
          const mapped = isLanguageVariant
            ? fromLanguageView(beforeBlocks, result.blocks, selectedLang)
            : { blocks: result.blocks, seededFallbackBlockIds: [] as string[] };
          const designCheck = await runClientDesignCheck(beforeBlocks, mapped.blocks);
          if (designCheck.status === "rejected") {
            clearStreamCanvas();
            return { ok: false, error: designCheck.reject };
          }
          if (isLanguageVariant) {
            setNewBlocks(mapped.blocks);
          } else {
            await replaceBlock(blockId, result.replacementBlocks ?? []);
          }
          clearStreamCanvas();
          return {
            ok: true,
            newBlockIds: result.newBlockIds,
            ...buildPostWriteNotes(beforeBlocks, mapped.blocks, designCheck.note, mapped.seededFallbackBlockIds),
          };
        }

        case "add_blocks": {
          const { html } = input;
          if (!html) return { ok: false, error: "add_blocks requires html" };
          const beforeBlocks = getCurrentBlocks();
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = await applyAddBlocks(
            workingBlocks,
            html,
            input.parentId,
            input.position,
            aiEditExecutorOptions,
          );
          if ("error" in result) {
            clearStreamCanvas();
            return { ok: false, error: result.error };
          }
          const mapped = isLanguageVariant
            ? fromLanguageView(beforeBlocks, result.blocks, selectedLang)
            : { blocks: result.blocks, seededFallbackBlockIds: [] as string[] };
          const designCheck = await runClientDesignCheck(beforeBlocks, mapped.blocks);
          if (designCheck.status === "rejected") {
            clearStreamCanvas();
            return { ok: false, error: designCheck.reject };
          }
          if (isLanguageVariant) {
            setNewBlocks(mapped.blocks);
          } else {
            addBlocks(result.insertedBlocks ?? [], result.parentId, result.position);
          }
          clearStreamCanvas();
          return {
            ok: true,
            newBlockIds: result.newBlockIds,
            ...buildPostWriteNotes(beforeBlocks, mapped.blocks, designCheck.note, mapped.seededFallbackBlockIds),
          };
        }

        case "remove_blocks": {
          const ids: string[] = input.ids ?? [];
          if (ids.length === 0) return { ok: false, error: "remove_blocks requires at least one id" };
          const result = applyRemoveBlocks(getCurrentBlocks(), ids);
          if ("error" in result) return { ok: false, error: result.error };
          await removeBlocks(result.removableIds ?? []);
          return { ok: true, skippedIds: result.skippedIds };
        }

        case "add_custom_block": {
          const { type, props } = input;
          if (!type) return { ok: false, error: "add_custom_block requires a type" };
          const beforeBlocks = getCurrentBlocks();
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = applyAddCustomBlock(
            workingBlocks,
            type,
            input.parentId,
            input.position,
            props ?? {},
            aiEditExecutorOptions,
          );
          if ("error" in result) return { ok: false, error: result.error };
          const mapped = isLanguageVariant
            ? fromLanguageView(beforeBlocks, result.blocks, selectedLang)
            : { blocks: result.blocks, seededFallbackBlockIds: [] as string[] };
          const designCheck = await runClientDesignCheck(beforeBlocks, mapped.blocks);
          if (designCheck.status === "rejected") {
            return { ok: false, error: designCheck.reject };
          }
          if (isLanguageVariant) {
            setNewBlocks(mapped.blocks);
          } else {
            addBlocks(result.insertedBlocks ?? [], result.parentId, result.position);
          }
          return {
            ok: true,
            newBlockIds: result.newBlockIds,
            ...buildPostWriteNotes(beforeBlocks, mapped.blocks, designCheck.note, mapped.seededFallbackBlockIds),
          };
        }

        case "add_library_block": {
          const blockId = typeof input.blockId === "string" ? input.blockId.trim() : "";
          if (!blockId) return { ok: false, error: "add_library_block requires a blockId" };
          let item: { blocks?: unknown; html?: unknown } | null = null;
          try {
            item = (await fetchAPI(apiUrl, {
              action: ACTIONS.GET_LIBRARY_ITEM,
              data: { id: blockId },
            })) as { blocks?: unknown; html?: unknown } | null;
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : `Failed to load library block "${blockId}"`,
            };
          }
          const content = Array.isArray(item?.blocks)
            ? (item.blocks as ChaiBlock[])
            : typeof item?.html === "string" && item.html.trim().length > 0
              ? item.html
              : null;
          if (!content) {
            return { ok: false, error: `Library block "${blockId}" not found or contains no blocks.` };
          }
          const beforeBlocks = getCurrentBlocks();
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = await applyAddLibraryBlocks(
            workingBlocks,
            content,
            input.parentId,
            input.position,
            aiEditExecutorOptions,
          );
          if ("error" in result) return { ok: false, error: result.error };
          const mapped = isLanguageVariant
            ? fromLanguageView(beforeBlocks, result.blocks, selectedLang)
            : { blocks: result.blocks, seededFallbackBlockIds: [] as string[] };
          const designCheck = await runClientDesignCheck(beforeBlocks, mapped.blocks);
          if (designCheck.status === "rejected") {
            return { ok: false, error: designCheck.reject };
          }
          if (isLanguageVariant) {
            setNewBlocks(mapped.blocks);
          } else {
            addBlocks(result.insertedBlocks ?? [], result.parentId, result.position);
          }
          const outline = buildPageOutlineForAi(result.insertedBlocks ?? []).trim();
          return {
            ok: true,
            newBlockIds: result.newBlockIds,
            ...(outline ? { outline } : {}),
            ...buildPostWriteNotes(beforeBlocks, mapped.blocks, designCheck.note, mapped.seededFallbackBlockIds),
          };
        }

        case "bind_prop": {
          const { blockId, propName, bindingPath } = input;
          if (!blockId || !propName || !bindingPath) {
            return { ok: false, error: "bind_prop requires blockId, propName and bindingPath" };
          }
          const beforeBlocks = getCurrentBlocks();
          const workingBlocks = isLanguageVariant ? toLanguageView(beforeBlocks, selectedLang) : beforeBlocks;
          const result = applyBindProp(workingBlocks, blockId, propName, bindingPath, { dataBindingPaths });
          if ("error" in result) return { ok: false, error: result.error };
          if (isLanguageVariant) {
            // Map through fromLanguageView so binding a translatable prop on a language
            // variant writes `${propName}-${selectedLang}` and never overwrites the fallback prop.
            const mapped = fromLanguageView(beforeBlocks, result.blocks, selectedLang);
            setNewBlocks(mapped.blocks);
            return {
              ok: true,
              ...buildPostWriteNotes(beforeBlocks, mapped.blocks, "", mapped.seededFallbackBlockIds),
            };
          }
          if (bindProp(blockId, propName, bindingPath) === false) {
            return { ok: false, error: "bind_prop requires a valid registered path | pipe binding" };
          }
          return { ok: true, ...buildPostWriteNotes(beforeBlocks, result.blocks, "") };
        }

        case "update_block_translations": {
          const rawTranslations = input.translations as TranslationUpdate[] | undefined;
          if (!Array.isArray(rawTranslations) || rawTranslations.length === 0) {
            return { ok: false, error: "update_block_translations requires a non-empty translations array" };
          }
          const beforeBlocks = getCurrentBlocks();
          if (scopedBlockId) {
            const scopedIds = collectSubtreeIds(beforeBlocks, [scopedBlockId]);
            const foreign = rawTranslations.find((entry) => !scopedIds.has(entry.blockId));
            if (foreign) {
              return {
                ok: false,
                error: `Cannot translate block "${foreign.blockId}" — only the selected block "${scopedBlockId}" and its descendants may be updated here.`,
              };
            }
          }
          const knownNote = configuredTranslationLangs.length
            ? ` Configured translation languages: ${configuredTranslationLangs.map(langLabel).join(", ")}.`
            : " The site has no other languages configured.";
          const targetLang = String(input.lang || (isLanguageVariant ? selectedLang : "")).trim();
          if (!targetLang) {
            return { ok: false, error: `Pass lang — the language to write translations for.${knownNote}` };
          }
          if (fallbackLang && targetLang === fallbackLang) {
            return {
              ok: false,
              error: `${langLabel(targetLang)} is the site fallback language; edit its copy directly with edit_block.${knownNote}`,
            };
          }
          if (configuredTranslationLangs.length > 0 && !configuredTranslationLangs.includes(targetLang)) {
            return { ok: false, error: `${langLabel(targetLang)} is not a configured site language.${knownNote}` };
          }

          // Parse JSON-encoded strings when the target prop's source is an object or array
          // (Builder AI's strict tool schema avoids z.record()).
          const byId = new Map(beforeBlocks.map((b) => [b._id, b as Record<string, unknown>]));
          const translations = rawTranslations.map((entry) => {
            if (typeof entry.value !== "string") return entry;
            const source = byId.get(entry.blockId)?.[entry.prop];
            if (source && typeof source === "object") {
              try {
                return { ...entry, value: JSON.parse(entry.value) };
              } catch {
                return entry;
              }
            }
            return entry;
          });

          const result = applyTranslations(beforeBlocks, targetLang, translations);
          if ("error" in result) return { ok: false, error: result.error };
          setNewBlocks(result.blocks);
          return { ok: true };
        }

        default:
          return { ok: false, error: `Unknown client tool: ${toolName}` };
      }
    },
    [
      addBlocks,
      aiEditExecutorOptions,
      bindProp,
      configuredTranslationLangs,
      dataBindingPaths,
      fallbackLang,
      isLanguageVariant,
      removeBlocks,
      replaceBlock,
      runClientDesignCheck,
      scopedBlockId,
      selectedLang,
      setNewBlocks,
      updateMultipleBlocksProps,
      variantLangs,
    ],
  );

  const executeToolCallRef = useRef(executeToolCall);
  executeToolCallRef.current = executeToolCall;

  const syncServerToolSideEffectsRef = useRef(syncServerToolSideEffects);
  syncServerToolSideEffectsRef.current = syncServerToolSideEffects;

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const chat = useChat<UIMessage>({
    transport,
    experimental_throttle: 50,
    sendAutomaticallyWhen: (options: { messages: UIMessage[] }) => {
      if (isStoppedRef.current) return false;
      if (!lastAssistantMessageIsCompleteWithToolCalls(options)) return false;
      if (autoContinuesRef.current >= MAX_AUTO_CONTINUES) {
        hitContinueLimitRef.current = true;
        return false;
      }
      autoContinuesRef.current += 1;
      return true;
    },
    onToolCall: (async ({ toolCall }) => {
      if (isStoppedRef.current) return;
      const toolName = (toolCall as any).toolName as string;
      // Server-executed tools (SEO, design system, uploads, reads) have their own
      // server execute() and stream their output back; never emit a fake client error for them.
      if (!CLIENT_EXECUTED_TOOL_SET.has(toolName)) return;
      const execution = (async () => {
        const input = toolInput((toolCall as any).input);
        let output: AiPageChatToolOutput;
        try {
          output = await executeToolCallRef.current(toolName, input);
        } catch (error) {
          output = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (isStoppedRef.current) return;
        if (output.ok && preSendBlocksRef.current && getCurrentBlocks() !== preSendBlocksRef.current) {
          pageModifiedByAiRef.current = true;
          scheduleCheckpoint();
        }
        addToolOutputRef.current({ tool: toolName, toolCallId: toolCall.toolCallId, output });
      })();
      pendingToolCallRef.current = execution;
      try {
        await execution;
      } finally {
        if (pendingToolCallRef.current === execution) pendingToolCallRef.current = null;
      }
    }) satisfies ChatOnToolCallCallback<UIMessage>,
    onFinish: (({ message, isAbort, isError }) => {
      clearStreamCanvas();
      cancelCheckpoint();
      queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
      // Always sync server-side mutations (SEO, design system), even on Stop,
      // because those server writes have already committed to the draft.
      syncServerToolSideEffectsRef.current(message).catch(noop);
      if (!isAbort && pageModifiedByAiRef.current) {
        pageModifiedByAiRef.current = false;
        savePageAsync(true).catch(noop);
      }
      onFinishRef.current?.({ message, isAbort, isError });
    }) satisfies ChatOnFinishCallback<UIMessage>,
    onError: ((error) => {
      clearStreamCanvas();
      cancelCheckpoint();
      if (!isStoppedRef.current && pageModifiedByAiRef.current) {
        pageModifiedByAiRef.current = false;
        savePageAsync(true).catch(noop);
      }
      const parsed = parseChatTransportError(error);
      if (parsed?.status === 401) {
        logout("SESSION_EXPIRED");
      }
      onErrorRef.current?.(error);
    }) satisfies ChatOnErrorCallback,
  });

  addToolOutputRef.current = ({ tool, toolCallId, output }) =>
    chat.addToolOutput({ state: "output-available", tool, toolCallId, output });

  // --- Live canvas preview while edit_block/add_blocks input streams in ---
  const { messages, status, setMessages } = chat;
  latestMessagesRef.current = messages;
  useEffect(() => {
    if (status !== "streaming" && status !== "submitted") return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    for (let i = lastMessage.parts.length - 1; i >= 0; i--) {
      const part = lastMessage.parts[i] as any;
      if (!isToolUIPart(part)) continue;
      if (part.state !== "input-streaming") return;
      const input = toolInput(part.input);
      if (typeof input.html !== "string") return;
      if (part.type === "tool-edit_block" && input.blockId) {
        if (scopedBlockId && input.blockId !== scopedBlockId) return;
        streamHtmlToCanvasForEdit(input.html, input.blockId, part.toolCallId);
      } else if (part.type === "tool-add_blocks") {
        if (scopedBlockId) return;
        const preview = resolvePreviewParentId(normalizeAiParentId(input.parentId));
        streamHtmlToCanvasForAdd(
          input.html,
          preview.parentId,
          preview.changed ? undefined : normalizeAiPosition(input.position),
          part.toolCallId,
        );
      }
      return;
    }
  }, [messages, status, scopedBlockId]);

  useEffect(() => {
    if (status !== "ready" || !hitContinueLimitRef.current) return;
    hitContinueLimitRef.current = false;
    setMessages((prev) => [
      ...prev,
      {
        id: generateUuid(),
        role: "assistant",
        parts: [
          {
            type: "text",
            text: 'This page is taking several steps to build, so I paused here to keep things responsive. Reply "continue" and I\'ll finish the remaining sections.',
          },
        ],
      },
    ]);
  }, [status, setMessages]);

  const sendPrompt = useCallback(
    async (prompt: string, { model, files, selectedBlockId, displayText, isAutoMode }: SendPromptOptions) => {
      requestContextRef.current.model = model;
      autoContinuesRef.current = 0;
      hitContinueLimitRef.current = false;
      isStoppedRef.current = false;
      pageModifiedByAiRef.current = false;
      preSendBlocksRef.current = getCurrentBlocks();
      const metadata: AiPageChatMessageMetadata | undefined =
        selectedBlockId || displayText || isAutoMode ? { selectedBlockId, displayText, isAutoMode } : undefined;
      await chat.sendMessage({
        text: prompt,
        ...(files && files.length > 0 ? { files } : {}),
        ...(metadata ? { metadata } : {}),
      });
    },
    [chat.sendMessage],
  );

  const stop = useCallback(async (): Promise<{ reverted: boolean; serverMutationsCommitted: boolean }> => {
    isStoppedRef.current = true;
    hitContinueLimitRef.current = false;
    cancelCheckpoint();
    await chat.stop();
    try {
      await pendingToolCallRef.current;
    } catch {
      /* tool execution errors are already handled inside onToolCall */
    }
    clearStreamCanvas();
    const preSendBlocks = preSendBlocksRef.current;
    preSendBlocksRef.current = null;
    const reverted = preSendBlocks !== null && getCurrentBlocks() !== preSendBlocks;
    if (reverted) setNewBlocks(preSendBlocks);
    pageModifiedByAiRef.current = false;

    const latestAssistant = [...latestMessagesRef.current].reverse().find((m) => m.role === "assistant");
    const serverMutationsCommitted = Boolean(
      Array.isArray(latestAssistant?.parts) &&
        (latestAssistant.parts as any[]).some(
          (part) =>
            isToolUIPart(part) &&
            part.state === "output-available" &&
            !(part.output && typeof part.output === "object" && (part.output as any).ok === false) &&
            SERVER_MUTATING_TOOLS.has(String(part.type).replace(/^tool-/, "")),
        ),
    );
    if (latestAssistant && serverMutationsCommitted) {
      await syncServerToolSideEffectsRef.current(latestAssistant).catch(noop);
    }

    return { reverted, serverMutationsCommitted };
  }, [chat.stop, setNewBlocks, cancelCheckpoint]);

  return {
    ...chat,
    sendPrompt,
    stop,
    isLoading: chat.status === "submitted" || chat.status === "streaming",
  };
};
