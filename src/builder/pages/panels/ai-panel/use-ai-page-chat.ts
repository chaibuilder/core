import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatOnErrorCallback, ChatOnFinishCallback, ChatOnToolCallCallback, FileUIPart, UIMessage } from "ai";
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useAtomValue } from "jotai";
import { noop } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { chaiDesignTokensAtom, usePageExternalData } from "~/builder/atoms/builder";
import { getCurrentBlocks } from "~/builder/atoms/store";
import { canAddChildBlock } from "~/builder/core/functions/block-helpers";
import { generateUUID } from "~/builder/core/functions/common-functions";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBindProp } from "~/builder/hooks/use-bind-prop";
import { useBlocksHtmlForAi } from "~/builder/hooks/use-blocks-html-for-ai";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { useReplaceBlock } from "~/builder/hooks/use-replace-block";
import { useSavePage } from "~/builder/hooks/use-save-page";
import { partialBlocksListAtom, useCheckPartialCanAdd } from "~/builder/hooks/use-partial-blocks-store";
import { AI_CREDITS_QUERY_KEY } from "~/builder/pages/constants/AI_CREDITS";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { AI_OMITTED_HTML_SENTINEL } from "~/constants/AI_TOOL_HISTORY";
import {
  applyAddBlocks,
  applyAddCustomBlock,
  applyBindProp,
  applyEditBlock,
  applyRemoveBlocks,
  normalizeAiParentId,
  normalizeAiPosition,
} from "~/server/chai-actions/ai/ask-ai/ai-edit-executors";
import { ChaiBlock } from "~/types/common";
import { buildInternalLinkResolver } from "~/utils/internal-link-refs";
import { ACTIONS } from "../../constants/ACTIONS";
import { useAIConfig } from "./ai-models-context";
import { clearStreamCanvas, streamHtmlToCanvasForAdd, streamHtmlToCanvasForEdit } from "./canvas-stream-preview";
import { buildDataBindingPayload, buildPageOutlineForAi } from "./page-outline-for-ai";

/** Client-side cap on tool-call continuation round-trips per user message. */
const MAX_AUTO_CONTINUES = 5;

/** Wait for the canvas iframe to repaint applied blocks before re-reading its DOM. */
const CANVAS_PAINT_DELAY_MS = 120;

/**
 * Debounce for the per-section DB checkpoint. During a multi-section generation
 * we persist after each section lands, so a mid-run interruption (timeout, tab
 * close) keeps every completed section instead of losing the whole run.
 */
const CHECKPOINT_DEBOUNCE_MS = 800;

export type AiPageChatToolOutput =
  | { ok: true; newBlockIds?: string[]; skippedIds?: string[] }
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
   * edit_block on this bid is allowed to run; every other mutation is rejected
   * client-side, so nothing can leak onto the rest of the page.
   */
  scopedBlockId?: string;
};

const toolInput = (input: unknown): Record<string, any> => (input && typeof input === "object" ? (input as any) : {});

/**
 * Live-preview parent resolution: the streamed html isn't parsed into blocks
 * yet, so we can't run full nesting rules — instead walk up past any target
 * that can't take children at all (e.g. PartialBlock), so the preview never
 * paints inside a childless block.
 *
 * `changed` reports whether the target moved off the original parent. When it
 * did, the caller must drop `position`: an index relative to the original
 * container is meaningless in the ancestor it walked up to.
 */
const resolvePreviewParentId = (parentId: string | undefined): { parentId: string | undefined; changed: boolean } => {
  const allBlocks = getCurrentBlocks();
  let currentId = parentId;
  while (currentId) {
    const block = allBlocks.find((b) => b._id === currentId);
    if (!block) return { parentId: currentId, changed: false }; // unknown bid — canvas falls back to root
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
 * - Streams UIMessages from the AI_EDIT_PAGE action (server: streamText + tools).
 * - Executes client tools (edit_block / add_blocks / remove_blocks /
 *   add_custom_block / bind_prop) against the builder's JSON block state —
 *   granular per-id patches, never a full page repaint.
 * - Mirrors streaming edit_block/add_blocks HTML into the canvas iframe for a
 *   live preview while the tool input is still being generated.
 * - Recomputes page HTML + outline per request (including tool-continuation
 *   round-trips) so every model step sees the post-edit page state.
 */
type UseAiPageChatResult = Omit<UseChatHelpers<UIMessage>, "stop"> & {
  sendPrompt: (prompt: string, options: SendPromptOptions) => Promise<void>;
  stop: () => Promise<{ reverted: boolean }>;
  isLoading: boolean;
};

export const useAiPageChat = ({ onFinish, onError, scopedBlockId }: UseAiPageChatOptions = {}): UseAiPageChatResult => {
  const apiUrl = useApiUrl();
  const getAccessToken = usePagesProp("getAccessToken", noop);
  const beforeRequest = usePagesProp("beforeRequest", noop);
  const logout = usePagesProp("onLogout", noop);
  const config = useAIConfig();
  const isAnimationEnabled = useBuilderProp("flags.animation", false);
  const designTokens = useAtomValue(chaiDesignTokensAtom);
  const pageExternalData = usePageExternalData();
  const dataBindingPaths = useMemo(() => buildDataBindingPayload(pageExternalData), [pageExternalData]);
  const { data: currentPage } = usePrimaryPage();
  const blocksHtmlForAi = useBlocksHtmlForAi();
  const queryClient = useQueryClient();
  const { savePageAsync } = useSavePage();

  const { addBlocks, setNewBlocks } = useBlocksStoreUndoableActions();
  const replaceBlock = useReplaceBlock();
  const removeBlocks = useRemoveBlocks();
  const bindProp = useBindProp();
  const partialBlocksList = useAtomValue(partialBlocksListAtom);
  const checkPartialCanAdd = useCheckPartialCanAdd();
  const { data: websitePages } = useWebsitePrimaryPages();

  /**
   * AI emits partials as `<chai-partial-block partial-id='...'>` with no name,
   * so the parsed block has a partialBlockId but no _name and the outline reads
   * "PartialBlock". Backfill _name from the partial list (same as the sidebar
   * add/drop paths) so the outline shows the partial's real name.
   *
   * Backstop for AI-emitted partial references: the get_partial_blocks tool
   * already filters what the model is offered, but nothing stops it from
   * emitting an arbitrary partial-id (self-reference, cycle, too deep). Runs
   * the same can-add rules as the sidebar add/drop/paste paths; returns the
   * violation reason or null.
   *
   * resolveInternalLink turns a slug the model wrote for a site page into the
   * `pageType:` reference the link picker stores, so the link survives slug changes.
   */
  const aiEditExecutorOptions = useMemo(
    () => ({
      partialBlockNames: Object.fromEntries(
        Object.entries(partialBlocksList).map(([id, partial]) => [id, partial.name]),
      ),
      validatePartialReference: (partialBlockId: string): string | null => {
        const { canAdd, reason } = checkPartialCanAdd(partialBlockId);
        return canAdd ? null : reason || "This partial block cannot be added to this page";
      },
      resolveInternalLink: buildInternalLinkResolver(websitePages),
    }),
    [checkPartialCanAdd, partialBlocksList, websitePages],
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

  requestContextRef.current.buildData = () => ({
    model: requestContextRef.current.model || undefined,
    context: config.context,
    designTokens,
    pageHtml: blocksHtmlForAi({}),
    pageOutline: buildPageOutlineForAi(getCurrentBlocks()),
    pageId: currentPage?.id ?? undefined,
    scopedBlockId,
    options: {
      animation: isAnimationEnabled,
      dataBindingPaths,
      pageType: currentPage?.pageType ?? undefined,
    },
  });

  const autoContinuesRef = useRef(0);
  /** Set when a run is cut short by the continuation cap so we can tell the user it is unfinished. */
  const hitContinueLimitRef = useRef(false);

  /** Blocks as they were when the user sent the prompt — restored on stop. */
  const preSendBlocksRef = useRef<ChaiBlock[] | null>(null);
  /** Set by stop(): blocks further tool execution and auto-continuations for the aborted run. */
  const isStoppedRef = useRef(false);
  /**
   * True once a tool call has successfully mutated the page during the current
   * run. Drives the auto-save on completion so a run that only answered a
   * question (no edits) doesn't trigger a needless save.
   */
  const pageModifiedByAiRef = useRef(false);
  /** In-flight tool execution, awaited by stop() so the revert runs after the last mutation. */
  const pendingToolCallRef = useRef<Promise<void> | null>(null);
  /** Pending debounced per-section checkpoint save. */
  const checkpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCheckpoint = useCallback(() => {
    if (checkpointTimerRef.current) {
      clearTimeout(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }
  }, []);

  /** Persist the page shortly after a section lands, so progress survives a mid-run interruption. */
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
          // Give the canvas iframe a beat to repaint blocks applied by the
          // previous tool call — pageHtml is read from the iframe DOM.
          await new Promise((resolve) => setTimeout(resolve, CANVAS_PAINT_DELAY_MS));

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

  /** Set each render so onToolCall (registered once) can add tool outputs. */
  const addToolOutputRef =
    useRef<(args: { tool: any; toolCallId: string; output: AiPageChatToolOutput }) => void>(noop);

  const executeToolCall = useCallback(
    async (toolName: string, input: Record<string, any>): Promise<AiPageChatToolOutput> => {
      // Block-scoped run: the server hands the model a reduced tool set, but the
      // client is what actually mutates state — so re-check here rather than
      // trusting the stream. Only the selected block may be replaced or bound.
      if (scopedBlockId) {
        if (toolName !== "edit_block" && toolName !== "bind_prop") {
          return {
            ok: false,
            error: `${toolName} is not available here — this conversation can only edit or bind the selected block "${scopedBlockId}".`,
          };
        }
        if (input.blockId !== scopedBlockId) {
          return {
            ok: false,
            error: `Cannot edit block "${input.blockId}" — only the selected block "${scopedBlockId}" may be edited here.`,
          };
        }
      }

      // The model sometimes echoes the pruned-history sentinel back as real
      // markup — applying it would persist the placeholder text as a block.
      // Also clear any streaming preview that painted it before this settled.
      if (typeof input.html === "string" && input.html.includes(AI_OMITTED_HTML_SENTINEL)) {
        clearStreamCanvas();
        return {
          ok: false,
          error:
            "That html is a placeholder from earlier context, not real markup. " +
            "Call read_block_html to fetch the current HTML, then send the complete markup.",
        };
      }

      switch (toolName) {
        case "edit_block": {
          const { blockId, html } = input;
          if (!blockId || !html) return { ok: false, error: "edit_block requires blockId and html" };
          const result = await applyEditBlock(getCurrentBlocks(), blockId, html, aiEditExecutorOptions);
          if ("error" in result) {
            clearStreamCanvas();
            return { ok: false, error: result.error };
          }
          await replaceBlock(blockId, result.replacementBlocks ?? []);
          clearStreamCanvas();
          return { ok: true, newBlockIds: result.newBlockIds };
        }

        case "add_blocks": {
          const { html } = input;
          if (!html) return { ok: false, error: "add_blocks requires html" };
          const result = await applyAddBlocks(
            getCurrentBlocks(),
            html,
            input.parentId,
            input.position,
            aiEditExecutorOptions,
          );
          if ("error" in result) {
            clearStreamCanvas();
            return { ok: false, error: result.error };
          }
          addBlocks(result.insertedBlocks ?? [], result.parentId, result.position);
          clearStreamCanvas();
          return { ok: true, newBlockIds: result.newBlockIds };
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
          const result = applyAddCustomBlock(
            getCurrentBlocks(),
            type,
            input.parentId,
            input.position,
            props ?? {},
            aiEditExecutorOptions,
          );
          if ("error" in result) return { ok: false, error: result.error };
          addBlocks(result.insertedBlocks ?? [], result.parentId, result.position);
          return { ok: true, newBlockIds: result.newBlockIds };
        }

        case "bind_prop": {
          const { blockId, propName, bindingPath } = input;
          if (!blockId || !propName || !bindingPath) {
            return { ok: false, error: "bind_prop requires blockId, propName and bindingPath" };
          }
          const result = applyBindProp(getCurrentBlocks(), blockId, propName, bindingPath, { dataBindingPaths });
          if ("error" in result) return { ok: false, error: result.error };
          if (bindProp(blockId, propName, bindingPath) === false) {
            return { ok: false, error: "bind_prop requires a valid registered path | pipe binding" };
          }
          return { ok: true };
        }

        default:
          return { ok: false, error: `Unknown client tool: ${toolName}` };
      }
    },
    [addBlocks, aiEditExecutorOptions, bindProp, dataBindingPaths, removeBlocks, replaceBlock, scopedBlockId],
  );

  const executeToolCallRef = useRef(executeToolCall);
  executeToolCallRef.current = executeToolCall;

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const chat = useChat<UIMessage>({
    transport,
    experimental_throttle: 50,
    sendAutomaticallyWhen: (options: { messages: UIMessage[] }) => {
      if (isStoppedRef.current) return false;
      // The model still had pending tool work but we won't auto-resume — mark the
      // run unfinished so onFinish can invite the user to continue.
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
      const execution = (async () => {
        const toolName = (toolCall as any).toolName as string;
        const input = toolInput((toolCall as any).input);
        let output: AiPageChatToolOutput;
        try {
          output = await executeToolCallRef.current(toolName, input);
        } catch (error) {
          output = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (isStoppedRef.current) return; // stopped mid-execution — the revert supersedes this output
        if (output.ok && preSendBlocksRef.current && getCurrentBlocks() !== preSendBlocksRef.current) {
          pageModifiedByAiRef.current = true;
          scheduleCheckpoint(); // persist this section so a later timeout doesn't lose it
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
      cancelCheckpoint(); // the final save below supersedes any pending checkpoint
      queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
      // Persist tool-applied edits once the run settles. We deliberately persist
      // on error/timeout too (a truncated stream keeps whatever sections were
      // already applied — otherwise a serverless timeout silently loses them).
      // Only a user abort is skipped: stop() reverts the page.
      if (!isAbort && pageModifiedByAiRef.current) {
        pageModifiedByAiRef.current = false;
        savePageAsync(true).catch(noop);
      }
      onFinishRef.current?.({ message, isAbort, isError });
    }) satisfies ChatOnFinishCallback<UIMessage>,
    onError: ((error) => {
      clearStreamCanvas();
      cancelCheckpoint();
      // A hard mid-stream failure (e.g. serverless timeout cutting the SSE
      // connection) may deliver onError without onFinish — persist here too so
      // partial work survives. Skipped during an in-progress user abort (stop()
      // reverts); flag-guarded so it never double-saves with onFinish.
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
  useEffect(() => {
    // Stale throttled renders can arrive after the run settled — never let
    // them resurrect a preview element that was already cleaned up.
    if (status !== "streaming" && status !== "submitted") return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    for (let i = lastMessage.parts.length - 1; i >= 0; i--) {
      const part = lastMessage.parts[i] as any;
      if (!isToolUIPart(part)) continue;
      if (part.state !== "input-streaming") return; // last tool part is settled — nothing to preview
      const input = toolInput(part.input);
      // By the time the html field starts streaming, all preceding fields
      // (task, blockId/parentId/position) are fully parsed.
      if (typeof input.html !== "string") return;
      if (part.type === "tool-edit_block" && input.blockId) {
        // Never preview an out-of-scope edit — the preview paints the canvas.
        if (scopedBlockId && input.blockId !== scopedBlockId) return;
        streamHtmlToCanvasForEdit(input.html, input.blockId, part.toolCallId);
      } else if (part.type === "tool-add_blocks") {
        if (scopedBlockId) return;
        const preview = resolvePreviewParentId(normalizeAiParentId(input.parentId));
        streamHtmlToCanvasForAdd(
          input.html,
          preview.parentId,
          // Position is relative to the original parent; once we've walked up to
          // a different container it no longer applies — append instead.
          preview.changed ? undefined : normalizeAiPosition(input.position),
          part.toolCallId,
        );
      }
      return;
    }
  }, [messages, status, scopedBlockId]);

  // A run cut short by the continuation cap leaves a partially-built page. Close
  // with a plain-language message so the user knows it is unfinished and can
  // resume, instead of the build silently stopping mid-page.
  useEffect(() => {
    if (status !== "ready" || !hitContinueLimitRef.current) return;
    hitContinueLimitRef.current = false;
    setMessages((prev) => [
      ...prev,
      {
        id: generateUUID(),
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

  /**
   * Abort the in-flight run and restore the page to its pre-prompt state.
   * Waits for any tool call that is mid-application so the revert lands last.
   * The revert uses the undoable store action, so stopping by mistake can be
   * undone (bringing back the partially applied AI changes).
   */
  const stop = useCallback(async (): Promise<{ reverted: boolean }> => {
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
    // Tool calls replace the blocks array on every mutation, so a changed
    // reference means the page was touched during this run.
    const reverted = preSendBlocks !== null && getCurrentBlocks() !== preSendBlocks;
    if (reverted) setNewBlocks(preSendBlocks);
    // The run was reverted — make sure no late onFinish/onError persists it.
    pageModifiedByAiRef.current = false;
    return { reverted };
  }, [chat.stop, setNewBlocks, cancelCheckpoint]);

  return {
    ...chat,
    sendPrompt,
    stop,
    isLoading: chat.status === "submitted" || chat.status === "streaming",
  };
};
