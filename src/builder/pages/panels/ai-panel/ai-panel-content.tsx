"use client";

import { noop } from "lodash-es";
import { Plus } from "lucide-react";
import { lazy, startTransition, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { ChaiSlot } from "~/builder/register-apis";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useAiContext } from "~/builder/pages/hooks/ai/use-ai-context";
import { useChaiActionFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { Button } from "~/components/ui/button";
import { ChaiAiContext } from "~/types";
import AiContextModal from "./ai-context-modal";
import { AiConversationType, getChatsForType, resetChatsForType, saveChatsForType } from "./ai-conversations-storage";
import {
  AICompleteCallback,
  AIConfig,
  AIConfigProvider,
  AIErrorCallback,
  AIEvent,
  AIModel,
  AISuccessCallback,
  useAIModels,
} from "./ai-models-context";
import { Message } from "./ai-panel-helper";
import { getDefaultModel } from "./models";

const AiPanelForDefaultLang = lazy(() => import("./ai-panel-default-lang"));
const AiPanelPageChat = lazy(() => import("./ai-panel-page-chat"));
const AiPanelForOtherLang = lazy(() => import("./ai-panel-other-lang"));
const AiPanelForImage = lazy(() => import("./ai-panel-for-image"));
const AiBlockFloatingHandoff = lazy(() => import("./ai-block-floating-handoff"));

export interface AiPanelContentProps {
  type?: "default" | "floating" | "generate-image";
  models?: AIModel[];
  onAIEvent?: (event: AIEvent) => void;
  onSuccess?: (data: AISuccessCallback) => void;
  onError?: (data: AIErrorCallback) => void;
  onComplete?: (data: AICompleteCallback) => void;
  context?: ChaiAiContext;
  [key: string]: any;
  updateLoadingState?: (loading: boolean) => void;
  onImageGenerate?: (url: string) => void;
}

// Main AI Panel Component
const AiPanelContentInner = ({
  type = "default",
  updateLoadingState,
  onImageGenerate,
}: {
  type?: "default" | "floating" | "generate-image";
  updateLoadingState?: (loading: boolean) => void;
  onImageGenerate?: (url: string) => void;
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [currentBlock, setCurrentBlock] = useState<any>(null);
  const { models } = useAIModels();
  // Seed the model from the host-configured list (delivered by the server over
  // GET_WEBSITE_DATA), NOT from the SDK's built-in default: `getDefaultModel()`
  // can return a model that the host doesn't serve (e.g. a google/* id when the
  // host only proxies OpenAI). That stray id is truthy, so every child panel
  // prefers it over its own `models[0]` fallback and sends an unsupported model,
  // which the provider rejects mid-stream and surfaces as "Empty AI response".
  const defaultModelId = (models.find((model: AIModel) => model.id === getDefaultModel()?.id) ?? models[0])?.id;
  const [selectedModel, setSelectedModel] = useState<string | undefined>(defaultModelId);
  // The model list lands asynchronously; once it does (or the selection drifts to
  // something the list no longer offers), snap back to a real, supported model.
  useEffect(() => {
    if (models.length > 0 && !models.some((model: AIModel) => model.id === selectedModel)) {
      setSelectedModel(defaultModelId);
    }
  }, [models, selectedModel, defaultModelId]);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isCreditsExpanded, setIsCreditsExpanded] = useState(false);
  const { selectedLang, fallbackLang } = useLanguages();
  const aiCreditsEnabled = useBuilderProp("flags.aiCredits", false);
  const fetch = useChaiActionFetch();
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page");

  // Page-chat (useChat-based) panel: remount key resets the conversation, and
  // the message count drives the "new conversation" button visibility.
  const [pageChatKey, setPageChatKey] = useState(0);
  const [pageChatMessageCount, setPageChatMessageCount] = useState(0);

  const suggestNewConversation = messages?.filter((m) => m.role === "user").length >= 4;
  const forceNewConversation = messages?.filter((m) => m.role === "user").length >= 10;

  const isFloatingPanel = type === "floating";
  const isGenerateImagePanel = type === "generate-image";
  // The page-editing panels (sidebar and block floating) run on the useChat/tool-call flow.
  const isPageChatPanel = !isGenerateImagePanel && !selectedLang;

  // Start a fresh page-chat conversation when the page changes
  useEffect(() => {
    setPageChatKey((key) => key + 1);
    setPageChatMessageCount(0);
  }, [page]);

  // Determine if this panel should use session storage persistence
  // Only defaultLang (type="default" with no selectedLang) and imageGeneration panels persist
  const shouldPersist = !isFloatingPanel && !selectedLang && (type === "default" || isGenerateImagePanel);
  const storageType: AiConversationType | null = shouldPersist
    ? isGenerateImagePanel
      ? "imageGeneration"
      : "defaultLang"
    : null;

  // Load persisted chats on mount (reset defaultLang when page changes)
  useEffect(() => {
    if (storageType) {
      // Reset defaultLang chats when page changes
      if (storageType === "defaultLang") {
        resetChatsForType(storageType);
        startTransition(() => setMessages([]));
      } else {
        const persistedChats = getChatsForType(storageType);
        if (persistedChats.length > 0) {
          startTransition(() => setMessages(persistedChats));
        }
      }
    }
  }, [storageType, page]);

  // Save chats to session storage when messages change (keep only last 10)
  useEffect(() => {
    if (storageType && messages.length > 0) {
      // Filter out streaming/incomplete messages and keep only last 10
      const chatsToSave = messages.filter((m) => !m.isStreaming).slice(-10);
      saveChatsForType(storageType, chatsToSave);
    }
  }, [messages, storageType]);

  useEffect(() => {
    if (!shouldPersist) {
      startTransition(() => setMessages([]));
    }
  }, [selectedLang, page, shouldPersist]);

  const handleReset = () => {
    setMessages([]);
    setInput("");
    setCurrentBlock(null);
    setAbortController(null);
    setIsLoading(false);
    // Remount the page-chat panel to start a fresh useChat conversation
    if (isPageChatPanel) {
      setPageChatKey((key) => key + 1);
      setPageChatMessageCount(0);
    }
    // Reset session storage for this panel type
    if (storageType) {
      resetChatsForType(storageType);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsLoading(false);
    setInput("");
    setCurrentBlock(null);

    // Remove the last incomplete reasoning message if it exists
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "assistant" && lastMessage.isReasoning && lastMessage.isStreaming) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    toast.info(t("Generation stopped"));
  };

  useEffect(() => {
    updateLoadingState?.(isLoading);
  }, [isLoading, updateLoadingState]);

  const commonProps = {
    t,
    fetch,
    input,
    messages,
    setInput,
    isLoading,
    handleStop,
    handleReset,
    setMessages,
    setIsLoading,
    currentBlock,
    fallbackLang,
    abortController,
    isFloatingPanel,
    setCurrentBlock,
    setAbortController,
    forceNewConversation,
    isGenerateImagePanel,
    suggestNewConversation,
    selectedModel,
    onModelChange: setSelectedModel,
  };

  return (
    <>
      {isLoading && !isGenerateImagePanel && (
        <div className="fixed inset-0 top-0 left-0 z-40 flex h-screen w-screen flex-col items-center justify-center bg-transparent" />
      )}
      <div className="flex h-full w-full flex-col">
        {!isFloatingPanel && (
          <>
            <div
              className={
                isGenerateImagePanel
                  ? "bg-accent/10 -mx-1 flex h-max items-center justify-between border-b px-2 pb-1"
                  : "relative h-0 max-h-0"
              }>
              {isGenerateImagePanel && (
                <div className="text-foreground text-xs font-medium">{t("Generate image with AI")}</div>
              )}
              <div
                className={
                  isGenerateImagePanel ? "space-x-2" : "absolute -top-8 right-0 flex items-center justify-between gap-2"
                }>
                {aiCreditsEnabled ? (
                  <ChaiSlot
                    slotId={CHAI_SLOT_IDS.AI_PANEL_HEADER}
                    context={{ variant: "compact", isExpanded: isCreditsExpanded, onToggle: setIsCreditsExpanded }}
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="icon-xs"
                  className={`h-5 w-5 ${(isPageChatPanel ? pageChatMessageCount > 0 : messages?.length > 0) ? "" : "pointer-events-none w-0 overflow-hidden opacity-0"}`}
                  onClick={handleReset}
                  disabled={isLoading}>
                  <Plus className="!h-3 !w-3" />
                </Button>
              </div>
            </div>
            {isCreditsExpanded && aiCreditsEnabled && (
              <ChaiSlot slotId={CHAI_SLOT_IDS.AI_PANEL_HEADER} context={{ variant: "expanded" }} />
            )}
            <AiContextModal open={isContextModalOpen} onOpenChange={setIsContextModalOpen} />
          </>
        )}
        <Suspense
          fallback={<div className="flex h-full w-full items-center justify-center text-xs">Loading AI Panel</div>}>
          {isGenerateImagePanel ? (
            <AiPanelForImage {...commonProps} selectedLang="" onImageGenerate={onImageGenerate} />
          ) : selectedLang ? (
            <AiPanelForOtherLang {...commonProps} selectedLang={selectedLang} />
          ) : isPageChatPanel ? (
            isFloatingPanel ? (
              // Block floating popover: hands the prompt to the side AI panel
              // instead of running the chat inline next to the block.
              <AiBlockFloatingHandoff />
            ) : (
              <AiPanelPageChat
                key={pageChatKey}
                t={t}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                onMessagesCountChange={setPageChatMessageCount}
                onRequestNewConversation={handleReset}
              />
            )
          ) : (
            <AiPanelForDefaultLang {...commonProps} />
          )}
        </Suspense>
      </div>
    </>
  );
};

export const AiPanelContent = ({
  type,
  models,
  onAIEvent,
  onSuccess,
  onError,
  onComplete,
  context,
  updateLoadingState,
  onImageGenerate,
  ...rest
}: AiPanelContentProps) => {
  const { data } = useAiContext();
  const resolvedContext = context ?? data ?? {};
  const config: Partial<AIConfig> = {
    models,
    onAIEvent,
    onSuccess,
    onError,
    onComplete,
    context: resolvedContext as ChaiAiContext,
    ...rest,
  };

  return (
    <AIConfigProvider config={config}>
      <AiPanelContentInner
        type={type}
        updateLoadingState={updateLoadingState || noop}
        onImageGenerate={onImageGenerate}
      />
    </AIConfigProvider>
  );
};

export default AiPanelContent;
