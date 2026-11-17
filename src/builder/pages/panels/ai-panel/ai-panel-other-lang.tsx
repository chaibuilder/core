"use client";

import type { FileUIPart } from "ai";
import { Bot, Square } from "lucide-react";
import { Fragment, lazy, startTransition, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useI18nBlocks } from "~/builder/hooks/use-i18n-blocks";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useStreamMultipleBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "~/builder/pages/components/ai-elements/conversation";
import { Message as AiMessage, MessageContent, MessageResponse } from "~/builder/pages/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "~/builder/pages/components/ai-elements/reasoning";
import { TaskMessage } from "~/builder/pages/components/ai-elements/task-message";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { Button } from "~/components/ui/button";
import { ChaiBlock } from "~/types/common";
import { AIModel, useAIConfig, useAIModels } from "./ai-models-context";
import { extractJsonFromResponse, getHumanReadableError, Message, normalizeAiBlocksResponse } from "./ai-panel-helper";
import { getDefaultModel } from "./models";
import { ModelSelectorDropdown } from "./model-selector-dropdown";
import { LANGUAGE_CONTENT_ACTIONS, getTranslationUserPrompt } from "./prompt-helper";
import { SelectedBlockDisplay } from "./selected-block-display";

const AiBlockFloatingAiPromptInput = lazy(() => import("./ai-block-floating-prompt-input"));

const MODEL_STORAGE_KEY = "chai-ai-selected-model";

interface AiPanelForOtherLangProps {
  fetch: any;
  input: string;
  isLoading: boolean;
  messages: Message[];
  fallbackLang: string;
  selectedLang: string;
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

const AiPanelForOtherLang = ({
  fetch,
  messages,
  setInput,
  isLoading,
  handleStop,
  setMessages,
  setIsLoading,
  selectedLang,
  fallbackLang,
  setAbortController,
  setCurrentBlock,
  selectedModel,
  onModelChange,
  isFloatingPanel = false,
}: AiPanelForOtherLangProps) => {
  const { t } = useTranslation();
  const { models } = useAIModels();
  const config = useAIConfig();
  const defaultModel = models.find((model: AIModel) => model.id === getDefaultModel()?.id) || models[0];
  const [localSelectedModel, setLocalSelectedModel] = useState(() => selectedModel || defaultModel?.id);
  const currentSelectedModel = localSelectedModel;

  // Load the persisted model choice after mount (localStorage is unavailable during
  // SSR/tests) and re-sync whenever the models list or incoming props change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved && models.find((m: AIModel) => m.id === saved)) {
      setLocalSelectedModel(saved);
    } else {
      setLocalSelectedModel(selectedModel || defaultModel?.id);
    }
  }, [models, selectedModel, defaultModel?.id]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedBlock = useSelectedBlock();
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const i18nBlocks = useI18nBlocks();
  const updateBlocksWithStream = useStreamMultipleBlocksProps();
  const { savePageAsync } = useChaiSavePage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleTranslationPrompt = async (prompt: string, content?: string, images?: FileUIPart[], model?: string) => {
    if (selectedBlock) {
      setCurrentBlock(selectedBlock as ChaiBlock);
    }
    const isTranslate = prompt?.toLowerCase() === "translate";
    const userMessageObj: Message = {
      id: Date.now().toString(),
      role: "user",
      content: getTranslationUserPrompt({
        fallbackLang,
        userInput: content || prompt,
        language: selectedLang,
        blocks: (isTranslate ? i18nBlocks() : i18nBlocks(selectedLang)) as ChaiBlock[],
      }),
      userMessage: content || prompt || t("Translate the content"),
    };

    // Add initial reasoning message that shows thinking state
    const reasoningMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "Thinking...",
      isReasoning: true,
      isStreaming: true,
    };

    setIsLoading(true);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    setMessages((prev) => [...prev, userMessageObj, reasoningMessage]);
    setIsLoading(true);

    const usedModel = model || currentSelectedModel;

    // Trigger stream start event
    config.onAIEvent?.({
      type: "stream_start",
      model: usedModel,
      timestamp: Date.now(),
    });

    try {
      const requestBody: any = {
        messages: [userMessageObj],
        initiator: isTranslate ? "TRANSLATE_CONTENT" : "UPDATE_CONTENT",
        model: usedModel,
        context: config.context,
      };

      const response = await fetch({
        body: { action: ACTIONS.AI_EDIT_LANG_PAGE, data: requestBody },
        streamResponse: true,
        options: { signal: controller.signal },
      });

      if (!response.ok) {
        throw new Error(t("Failed to get AI response"));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      if (!reader) throw new Error(t("Response body is not readable"));

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
      }

      const blocks = normalizeAiBlocksResponse(extractJsonFromResponse(accumulatedText), selectedLang);
      if (blocks.length === 0) {
        throw new Error("Invalid AI response: no valid block updates were returned.");
      }
      await updateBlocksWithStream(blocks);

      // Persist the translated content once the AI action settles, mirroring the
      // page-chat panel. Only save when the run actually updated blocks.
      if (blocks.length > 0) {
        savePageAsync(true).catch(() => {});
      }

      // Replace the reasoning message with a success message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== reasoningMessage.id);
        return [
          ...filtered,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: t("Content updated successfully."),
          },
        ];
      });

      // Trigger success callbacks with actual AI response (non-urgent update)
      startTransition(() => {
        const timestamp = Date.now();
        config.onSuccess?.({
          content: accumulatedText,
          model: usedModel,
          timestamp,
        });
        config.onComplete?.({
          success: true,
          content: accumulatedText,
          model: usedModel,
          timestamp,
        });
        config.onAIEvent?.({
          type: "completion",
          content: accumulatedText,
          model: usedModel,
          timestamp,
        });
      });
    } catch (error: any) {
      // Don't show error message if request was aborted
      if (error.name !== "AbortError") {
        const humanReadableMsg = getHumanReadableError(error);
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: humanReadableMsg,
        };

        // Remove the reasoning message and add error message
        setMessages((prev) => {
          const filtered = prev.filter((m) => !(m.isReasoning && m.isStreaming));
          return [...filtered, errorMsg];
        });

        // Trigger error callbacks with actual error (non-urgent update)
        startTransition(() => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = Date.now();
          config.onError?.({ error: errorMessage, model: usedModel, timestamp });
          config.onComplete?.({
            success: false,
            error: errorMessage,
            model: usedModel,
            timestamp,
          });
          config.onAIEvent?.({
            type: "error",
            error: errorMessage,
            model: usedModel,
            timestamp,
          });
        });
      }
    } finally {
      setIsLoading(false);
      setInput("");
      setCurrentBlock(null);
    }
  };

  if (isFloatingPanel) {
    return (
      <Suspense>
        <AiBlockFloatingAiPromptInput
          selectedLang={selectedLang}
          isLoading={isLoading}
          onSend={handleTranslationPrompt}
        />
      </Suspense>
    );
  }

  const langName = LANGUAGES[selectedLang] || selectedLang;

  const handleModelChange = (model: string) => {
    setLocalSelectedModel(model);
    onModelChange?.(model);
    localStorage.setItem(MODEL_STORAGE_KEY, model);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto ${isLoading ? "relative z-50" : ""}`}>
        <Conversation className="no-scrollbar h-full px-0">
          <ConversationContent className="gap-4 px-0 pb-4">
            {messages.length === 0 && (
              <ConversationEmptyState
                icon={<Bot size={30} className="text-foreground/50" />}
                title={t("Start a conversation with the AI assistant to translate/edit your content")}
                description={t(
                  "Only content can be edited in secondary languages. To edit layout, styles and more, switch to the default language.",
                )}
              />
            )}
            {messages.map(
              (message) =>
                message.role !== "system" && (
                  <Fragment key={message.id}>
                    {message.isReasoning ? (
                      <Reasoning isStreaming={message.isStreaming} defaultOpen={true} className="gap-0 space-y-0">
                        <ReasoningTrigger className="[&_p]:text-muted-foreground text-xs" />
                        <ReasoningContent className="p-0 text-xs" showLastLinesOnly={2}>
                          {message.content}
                        </ReasoningContent>
                      </Reasoning>
                    ) : message.isTask && !message.isTaskCompleted ? (
                      <TaskMessage content={message.content} isLoading={message.isTaskLoading} />
                    ) : (
                      <AiMessage from={message.role}>
                        <MessageContent className="!p-0">
                          {message.role === "assistant" ? (
                            <MessageResponse className="p-0 text-xs">{message.content}</MessageResponse>
                          ) : (
                            <div className="bg-accent rounded-sm p-2 text-xs">
                              {message.userMessage || message.content}
                            </div>
                          )}
                        </MessageContent>
                      </AiMessage>
                    )}
                  </Fragment>
                ),
            )}
            <div ref={messagesEndRef} />
          </ConversationContent>
        </Conversation>
      </div>

      {/* Selected Block display and Quick actions */}
      <div className="p-1">
        <SelectedBlockDisplay onRemove={() => setSelectedBlockIds([])} isLoading={isLoading} />
        <div className="border-border rounded-md border pb-1">
          <div className="bg-accent/30 flex flex-col border-b px-1 px-4 pt-2 pb-2">
            <h4 className="text-foreground text-xs font-medium">{t("Quick actions")}</h4>
            <span className="text-muted-foreground mt-0.5 text-xs">
              {t("Actions will work only on the selected block")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 pt-2">
            {/* Translate action */}
            <Button
              variant="ghost"
              size="sm"
              className="h-auto justify-start px-2 py-1 text-left"
              disabled={isLoading}
              onClick={() => handleTranslationPrompt("TRANSLATE", t("Translate to {{lang}}", { lang: langName }))}>
              <span className="text-xs">{t("Translate to {{lang}}", { lang: langName })}</span>
            </Button>

            {/* Content actions (excluding emoji actions) */}
            {LANGUAGE_CONTENT_ACTIONS.filter((action) => !action.prompt.toLowerCase().includes("emoji")).map(
              (action) => (
                <Button
                  key={action.label}
                  variant="ghost"
                  size="sm"
                  className="h-auto justify-start px-2 py-1 text-left"
                  disabled={isLoading}
                  onClick={() => handleTranslationPrompt(action.prompt)}>
                  <span className="text-xs">{t(action.label)}</span>
                </Button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar: model selector + stop button */}
      <div className={`flex items-center justify-between pt-3 pb-1 ${isLoading ? "relative z-50" : ""}`}>
        <ModelSelectorDropdown
          selectedModel={currentSelectedModel}
          onModelChange={handleModelChange}
          disabled={isLoading}
        />
        {isLoading && (
          <Button onClick={handleStop} size="xs" variant="secondary" title={t("Stop generation")}>
            <Square className="!h-3 !w-3" /> {t("Stop")}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AiPanelForOtherLang;
