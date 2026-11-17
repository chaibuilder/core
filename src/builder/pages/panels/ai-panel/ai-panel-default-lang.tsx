"use client";

import type { FileUIPart } from "ai";
import { useAtomValue } from "jotai";
import { Bot } from "lucide-react";
import { Fragment, lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { useBlocksHtmlForAi } from "~/builder/hooks/use-blocks-html-for-ai";
import { usePageExternalData } from "~/builder/atoms/builder";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "~/builder/pages/components/ai-elements/conversation";
import { Message as AiMessage, MessageContent, MessageResponse } from "~/builder/pages/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "~/builder/pages/components/ai-elements/reasoning";
import { stripGeneratedCode } from "./ai-chat-text";
import { TaskMessage } from "~/builder/pages/components/ai-elements/task-message";
import { ChaiBlock } from "~/types/common";
import { ACTIONS } from "../../constants/ACTIONS";
import AiContextModal from "./ai-context-modal";
import { AIModel, useAIConfig, useAIModels } from "./ai-models-context";
import { getHumanReadableError, Message, type AiAutoModeData } from "./ai-panel-helper";
import { ContextDisplayBar } from "./context-display-bar";
import { getDefaultModel } from "./models";
import { buildDataBindingPayload } from "./page-outline-for-ai";
import { getUserPrompt } from "./prompt-helper";
import { useProcessAiStream } from "./use-process-ai-stream";

const AiPromptInput = lazy(() => import("./ai-prompt-input"));
const AiBlockFloatingAiPromptInput = lazy(() => import("./ai-block-floating-prompt-input"));

interface AiPanelForDefaultLangProps {
  t: any;
  fetch: any;
  input: string;
  isLoading: boolean;
  messages: Message[];
  fallbackLang: string;
  handleStop: () => void;
  handleReset: () => void;
  forceNewConversation: boolean;
  currentBlock: ChaiBlock | null;
  suggestNewConversation: boolean;
  setInput: (value: string) => void;
  abortController: AbortController | null;
  setIsLoading: (loading: boolean) => void;
  setCurrentBlock: (block: ChaiBlock | null) => void;
  setAbortController: (controller: AbortController | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  isFloatingPanel?: boolean;
}

const AiPanelForDefaultLang = ({
  t,
  fetch,
  input,
  messages,
  setInput,
  isLoading,
  setMessages,
  handleStop,
  setIsLoading,
  currentBlock,
  fallbackLang,
  setCurrentBlock,
  setAbortController,
  selectedModel,
  onModelChange,
  isFloatingPanel,
}: AiPanelForDefaultLangProps) => {
  const isAnimationEnabled = useBuilderProp("flags.animation", false);
  const { models } = useAIModels();
  const config = useAIConfig();
  const defaultModel = models.find((model: AIModel) => model.id === getDefaultModel()?.id) || models[0];
  const currentSelectedModel = selectedModel || defaultModel.id;

  const selectedBlock = useSelectedBlock();
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const blocksHtmlForAi = useBlocksHtmlForAi();
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [contextModalTab, setContextModalTab] = useState<"site" | "page">("page");
  const { savePageAsync } = useChaiSavePage();
  const designTokens = useAtomValue(chaiDesignTokensAtom);
  const pageExternalData = usePageExternalData();
  const { data: currentPage } = usePrimaryPage();

  const processAiStream = useProcessAiStream();
  const handleSend = async (
    prompt: string,
    content?: string,
    images?: FileUIPart[],
    model?: string,
    attachments?: FileUIPart[],
    isAutoMode?: boolean,
  ) => {
    if (!prompt || isLoading) return;

    setCurrentBlock(selectedBlock as ChaiBlock);
    // Always get full page HTML for better AI context
    // If a block is selected, mark it with data-ai-selected attribute
    const html = blocksHtmlForAi({
      blockId: isFloatingPanel ? selectedBlock?._id : undefined,
    });

    const userMessageObj: Message = {
      id: Date.now().toString(),
      role: "user",
      content: getUserPrompt({
        language: fallbackLang,
        userInput: content || prompt,
        currentHtml: html,
      }),
      userMessage: prompt,
    };

    const reasoningMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      isReasoning: true,
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessageObj, reasoningMessage]);
    setIsLoading(true);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    const usedModel = model || currentSelectedModel;

    // Trigger stream start event
    config.onAIEvent?.({
      type: "stream_start",
      model: usedModel,
      timestamp: Date.now(),
    });

    try {
      const requestBody: any = {
        messages: [userMessageObj].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: model || currentSelectedModel,
        context: config.context,
        designTokens,
        options: {
          animation: isAnimationEnabled,
          dataBindingPaths: buildDataBindingPayload(pageExternalData),
          pageType: currentPage?.pageType ?? undefined,
        },
      };

      // Add image to request if provided
      if (images && images.length > 0) {
        requestBody.images = images.map(({ url }) => url);
      }

      // Add non-image file attachments if provided (PDF, DOCX, Excel etc.)
      if (attachments && attachments.length > 0) {
        requestBody.attachments = attachments.map(({ url, mediaType, filename }) => ({
          url,
          mediaType,
          filename,
        }));
      }

      const isBlockEdit = isFloatingPanel || Boolean(selectedBlock?._id);
      const response = await fetch({
        body: { action: isBlockEdit ? ACTIONS.AI_EDIT_BLOCK : ACTIONS.AI_EDIT_PAGE, data: requestBody },
        streamResponse: true,
        options: { signal: controller.signal },
      });

      if (!response.ok) {
        throw new Error(t("Failed to get AI response"));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error(t("Response body is not readable"));
      await processAiStream(reader, setMessages);

      // Capture the AI response and trigger callbacks after stream completes
      setMessages((prev) => {
        // Get the last assistant message after streaming completes
        startTransition(() => {
          const assistantMessages = prev.filter((m) => m.role === "assistant" && !m.isReasoning && !m.isTask);
          const lastResponse = assistantMessages[assistantMessages.length - 1]?.content || "";
          const timestamp = Date.now();

          // Trigger success callbacks with actual AI response
          config.onSuccess?.({
            content: lastResponse,
            model: usedModel,
            timestamp,
          });
          config.onComplete?.({
            success: true,
            content: lastResponse,
            model: usedModel,
            timestamp,
          });
          config.onAIEvent?.({
            type: "completion",
            content: lastResponse,
            model: usedModel,
            timestamp,
          });
        });

        return prev;
      });

      // * Save page if auto mode is enabled
      if (isAutoMode) await savePageAsync(true);
    } catch (error: any) {
      // Don't show error message if request was aborted
      if (error.name !== "AbortError") {
        const humanReadableMsg = getHumanReadableError(error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: humanReadableMsg,
        };

        // Remove the reasoning message and add error message
        setMessages((prev) => {
          const filtered = prev.filter((m) => !(m.isReasoning && m.isStreaming));
          return [...filtered, errorMessage];
        });

        // Trigger error callbacks with actual error message (non-urgent update)
        startTransition(() => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const timestamp = Date.now();

          config.onError?.({ error: errorMsg, model: usedModel, timestamp });
          config.onComplete?.({
            success: false,
            error: errorMsg,
            model: usedModel,
            timestamp,
          });
          config.onAIEvent?.({
            type: "error",
            error: errorMsg,
            model: usedModel,
            timestamp,
          });
        });
      }
    } finally {
      setInput("");
      setIsLoading(false);
      setCurrentBlock(null);
      setAbortController(null);
    }
  };

  // Popup handoff: type + send on AI_AUTO_MODE (Option A: event fires after panel mounted).
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const autoModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (autoModeTimerRef.current) clearTimeout(autoModeTimerRef.current);
    },
    [],
  );

  const onAiAutoMode = useCallback(
    (data?: AiAutoModeData) => {
      if (isFloatingPanel || !data?.homePagePrompt) return;
      const prompt = data.homePagePrompt;
      setInput(prompt);
      if (autoModeTimerRef.current) clearTimeout(autoModeTimerRef.current);
      autoModeTimerRef.current = setTimeout(() => {
        autoModeTimerRef.current = null;
        handleSendRef.current(prompt, undefined, undefined, undefined, undefined, true);
      }, 1000);
    },
    [isFloatingPanel, setInput],
  );
  usePubSubListener(CHAI_BUILDER_EVENTS.AI_AUTO_MODE, onAiAutoMode);

  if (isFloatingPanel) {
    return (
      <Suspense>
        <AiBlockFloatingAiPromptInput selectedLang="" isLoading={isLoading} onSend={handleSend} />
      </Suspense>
    );
  }

  return (
    <>
      <Conversation className="no-scrollbar px-0">
        <ConversationContent className="no-scrollbar gap-4 px-0">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<Bot size={30} className="text-foreground/50" />}
              title="Start a conversation"
              description={t("Start a conversation with the AI assistant to add/edit current page")}
            />
          )}
          {messages.map(
            (message) =>
              message.role !== "system" && (
                <Fragment key={message.id}>
                  {message.isReasoning ? (
                    // Show the thinking, but strip any code so raw markup never leaks in.
                    <Reasoning isStreaming={message.isStreaming} defaultOpen={true} className="gap-0 space-y-0">
                      <ReasoningTrigger className="[&_p]:text-muted-foreground text-xs" />
                      <ReasoningContent className="p-0 text-xs" showLastLinesOnly={2}>
                        {stripGeneratedCode(message.content ?? "")}
                      </ReasoningContent>
                    </Reasoning>
                  ) : message.isTask && !message.isTaskCompleted ? (
                    <TaskMessage content={message.content} isLoading={message.isTaskLoading} />
                  ) : message.role === "assistant" ? (
                    // Skip empty bubbles when the message was pure code that got stripped.
                    stripGeneratedCode(message.content ?? "") ? (
                      <AiMessage from={message.role}>
                        <MessageContent className="!p-0">
                          <MessageResponse className="p-0 text-xs">
                            {stripGeneratedCode(message.content ?? "")}
                          </MessageResponse>
                        </MessageContent>
                      </AiMessage>
                    ) : null
                  ) : (
                    <AiMessage from={message.role}>
                      <MessageContent className="!p-0">
                        <div className="bg-accent rounded-sm p-2 text-xs">{message.userMessage || message.content}</div>
                      </MessageContent>
                    </AiMessage>
                  )}
                </Fragment>
              ),
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className={`border-border pb-2`}>
        <ContextDisplayBar
          onRemove={() => setSelectedBlockIds([])}
          onManageContext={(type) => {
            if (type) setContextModalTab(type);
            setIsContextModalOpen(true);
          }}
          isLoading={isLoading}
        />
        <AiContextModal open={isContextModalOpen} onOpenChange={setIsContextModalOpen} defaultTab={contextModalTab} />
        <Suspense fallback={<div>Loading...</div>}>
          <AiPromptInput
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onStop={handleStop}
            isLoading={isLoading}
            selectedLang=""
            currentBlock={(selectedBlock || currentBlock) as ChaiBlock}
            disabled={input?.length === 0}
            selectedModel={currentSelectedModel}
            onModelChange={onModelChange}
          />
        </Suspense>
      </div>
    </>
  );
};

export default AiPanelForDefaultLang;
