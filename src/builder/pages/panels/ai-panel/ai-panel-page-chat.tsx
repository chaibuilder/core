"use client";

import type { UIMessage } from "ai";
import { AlertTriangle, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useSearchParams } from "~/builder/pages/hooks/utils/use-search-params";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "~/builder/pages/components/ai-elements/conversation";
import { Message as AiMessage, MessageContent, MessageResponse } from "~/builder/pages/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "~/builder/pages/components/ai-elements/reasoning";
import { cn } from "~/lib/utils";
import { ChaiBlock } from "~/types/common";
import { stripGeneratedCode } from "./ai-chat-text";
import AiContextModal from "./ai-context-modal";
import { AI_PANEL_COMPOSER_ID } from "./ai-panel";
import { AIModel, useAIConfig, useAIModels } from "./ai-models-context";
import {
  computeSectionProgress,
  computeTotalTokensUsed,
  getHumanReadableError,
  TOKEN_USAGE_WARNING_THRESHOLD,
  type AiAutoModeData,
  typePromptIntoInput,
} from "./ai-panel-helper";
import { ContextDisplayBar } from "./context-display-bar";
import { getDefaultModel } from "./models";
import { usePendingAiPrompt } from "./pending-ai-prompt";
import { SectionProgress } from "./section-progress";
import { ToolPartCard } from "./tool-part-card";
import { AiPageChatMessageMetadata, parseChatTransportError, useAiPageChat } from "./use-ai-page-chat";
import { Button } from "~/components/ui/button";

const AiPromptInput = lazy(() => import("./ai-prompt-input"));

const MAX_USER_MESSAGE_CHARS = 200;
const AUTO_MODE_HIGHLIGHT_MS = 2000;

interface AiPanelPageChatProps {
  t: any;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  /** Lets the parent panel know whether the conversation has messages (reset button visibility). */
  onMessagesCountChange?: (count: number) => void;
  /** Same reset the panel header's "+" button already triggers — reused by the token-usage warning banner. */
  onRequestNewConversation?: () => void;
}

/** Full chat-bubble prompt text — does not touch the input. */
const getUserPromptText = (message: UIMessage): string => {
  const metadata = message.metadata as AiPageChatMessageMetadata | undefined;
  return (
    metadata?.displayText ??
    message.parts
      .filter((part) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n")
  );
};

const UserPromptBubble = ({ message }: { message: UIMessage }) => {
  const metadata = message.metadata as AiPageChatMessageMetadata | undefined;
  const fullText = getUserPromptText(message);
  const canExpand = fullText.length > MAX_USER_MESSAGE_CHARS;
  const [expanded, setExpanded] = useState(false);
  const [highlight, setHighlight] = useState(Boolean(metadata?.isAutoMode));

  useEffect(() => {
    if (!metadata?.isAutoMode) return;
    const timer = setTimeout(() => setHighlight(false), AUTO_MODE_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [metadata?.isAutoMode]);

  const displayText = canExpand && !expanded ? `${fullText.slice(0, MAX_USER_MESSAGE_CHARS)}…` : fullText;

  return (
    <div className={cn("relative")}>
      <div
        className={cn(
          "absolute inset-0 z-0",
          highlight ? "from-primary/30 to-primary/5 animate-pulse bg-gradient-to-t" : "",
        )}></div>
      <div
        className={cn(
          "z-20 max-w-lg rounded-sm p-2 text-xs whitespace-pre-wrap transition-colors duration-300",
          false ? "bg-primary text-primary-foreground animate-pulse" : "bg-accent",
        )}>
        {displayText}
      </div>
      {canExpand && !highlight ? (
        <Button
          aria-label={expanded ? "Show less" : "Show more"}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            "from-accent via-accent text-muted-foreground absolute bottom-0 z-20 flex h-6 w-full cursor-pointer items-center justify-center rounded-t-none border-0 bg-gradient-to-t to-transparent transition-colors hover:bg-gradient-to-t",
          )}>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
      ) : null}
    </div>
  );
};

const AiPanelPageChat = ({
  t,
  setIsLoading,
  selectedModel,
  onModelChange,
  onMessagesCountChange,
  onRequestNewConversation,
}: AiPanelPageChatProps) => {
  const { models } = useAIModels();
  const config = useAIConfig();
  const defaultModel = models.find((model: AIModel) => model.id === getDefaultModel()?.id) || models[0];
  const currentSelectedModel = selectedModel || defaultModel?.id;

  const [input, setInput] = useState("");
  const [isTypingPrompt, setIsTypingPrompt] = useState(false);
  const isTypingPromptRef = useRef(false);
  const autoModeCleanupRef = useRef<(() => void) | null>(null);
  // Freezes any still-streaming reasoning block's label to "Thinking stopped"
  // instead of leaving it mid-thought forever. Cleared at the start of the next run.
  const [wasStopped, setWasStopped] = useState(false);
  // Drives the tracker's halted/Resume state. Scoped to errors only -- a user
  // Stop already reverts the page (nothing built survives to resume into), so
  // it keeps its own plain "Generation stopped" message instead of a halted
  // tracker. An unrecovered error is different: partial sections are saved
  // (see use-ai-page-chat's persist-on-error), so Resume has real work to
  // continue from. Cleared at the start of the next run.
  const [wasErrored, setWasErrored] = useState(false);
  const selectedBlock = useSelectedBlock();
  const [, setSelectedBlockIds] = useSelectedBlockIds();
  const [searchParams] = useSearchParams();
  const currentPageId = searchParams.get("page");
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [contextModalTab, setContextModalTab] = useState<"site" | "page">("page");
  const usedModelRef = useRef(currentSelectedModel);

  // A handed-off prompt (Style panel / block floating icon) scopes just the one
  // turn it triggered -- a normal conversation can still touch the whole page.
  const [styleScopedBlockId, setStyleScopedBlockId] = useState<string | null>(null);
  const scopedBlockId = styleScopedBlockId ?? undefined;

  const { messages, setMessages, sendPrompt, stop, isLoading, status, error, clearError } = useAiPageChat({
    scopedBlockId,
    onFinish: ({ message, isAbort, isError }) => {
      setStyleScopedBlockId(null);
      if (isError) setWasErrored(true);
      if (isAbort || isError) return;
      startTransition(() => {
        const content = message.parts
          .filter((part) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n");
        const timestamp = Date.now();
        const model = usedModelRef.current;
        config.onSuccess?.({ content, model, timestamp });
        config.onComplete?.({ success: true, content, model, timestamp });
        config.onAIEvent?.({ type: "completion", content, model, timestamp });
      });
    },
    onError: (chatError) => {
      setStyleScopedBlockId(null);
      setWasErrored(true);
      startTransition(() => {
        const errorMsg = chatError instanceof Error ? chatError.message : String(chatError);
        const timestamp = Date.now();
        const model = usedModelRef.current;
        config.onError?.({ error: errorMsg, model, timestamp });
        config.onComplete?.({ success: false, error: errorMsg, model, timestamp });
        config.onAIEvent?.({ type: "error", error: errorMsg, model, timestamp });
      });
    },
  });

  // Bridge chat status to the parent panel (fullscreen overlay + header state)
  useEffect(() => {
    setIsLoading(isLoading);
  }, [isLoading, setIsLoading]);

  useEffect(() => {
    onMessagesCountChange?.(messages.length);
  }, [messages.length, onMessagesCountChange]);

  // Progressive-generation checklist — see computeSectionProgress for the logic.
  const { sectionPlan, completedSections } = useMemo(() => computeSectionProgress(messages), [messages]);
  // Token-usage warning (cbpl#161) — see TOKEN_USAGE_WARNING_THRESHOLD for how
  // the number was picked. Coexists with the silent hard-reset elsewhere at
  // 10 user messages; this is the earlier, visible, opt-in warning.
  const totalTokensUsed = useMemo(() => computeTotalTokensUsed(messages), [messages]);
  const showTokenWarning = !isLoading && totalTokensUsed >= TOKEN_USAGE_WARNING_THRESHOLD;
  const isHalted = wasErrored && !isLoading && sectionPlan.length > 0 && completedSections < sectionPlan.length;
  // Up to 3 upcoming plan items, shown as dim look-ahead rows right after the
  // running action so the user can see where the build is heading. Not yet
  // events -- they come from the plan, so they carry no tick, no spinner.
  const queuedSections = isLoading ? sectionPlan.slice(completedSections + 1, completedSections + 1 + 3) : [];

  const handleSend = async (
    prompt: string,
    content?: string,
    images?: any[],
    model?: string,
    attachments?: any[],
    isAutoMode?: boolean,
  ) => {
    if (!prompt || isLoading || isTypingPromptRef.current) return;
    clearError();
    setInput("");
    setWasStopped(false);
    setWasErrored(false);

    const usedModel = model || currentSelectedModel;
    usedModelRef.current = usedModel;
    config.onAIEvent?.({ type: "stream_start", model: usedModel, timestamp: Date.now() });

    let files = [...(images ?? []), ...(attachments ?? [])];
    const modelDef = models.find((m: AIModel) => m.id === usedModel);
    if (files.length > 0 && modelDef?.allowedFileTypes && modelDef.allowedFileTypes.length === 0) {
      // Text-only model — sending files would be silently ignored by the provider
      files = [];
      toast.warning(
        t("{{model}} can't read images or files. Attachments were not sent — switch models to use them.", {
          model: modelDef.name,
        }),
      );
    }
    await sendPrompt(content || prompt, {
      model: usedModel,
      files,
      isAutoMode,
      selectedBlockId: selectedBlock?._id,
      displayText: content && content !== prompt ? prompt : undefined,
    });
  };

  const handleStop = async () => {
    setStyleScopedBlockId(null);
    setWasStopped(true);
    const { reverted } = await stop();
    const text = reverted
      ? t("Generation stopped. The page was restored to how it was before this prompt.")
      : t("Generation stopped.");
    setMessages((prev: UIMessage[]) => [
      ...prev,
      { id: generateUuid(), role: "assistant", parts: [{ type: "text", text }] },
    ]);
  };

  // Popup handoff: typewriter + send on AI_AUTO_MODE (Option A: event fires after panel mounted).
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(
    () => () => {
      autoModeCleanupRef.current?.();
      autoModeCleanupRef.current = null;
    },
    [],
  );

  const onAiAutoMode = useCallback((data?: AiAutoModeData) => {
    if (!data?.homePagePrompt) return;
    const prompt = data.homePagePrompt;
    autoModeCleanupRef.current?.();
    isTypingPromptRef.current = true;
    setIsTypingPrompt(true);
    autoModeCleanupRef.current = typePromptIntoInput(prompt, setInput, () => {
      isTypingPromptRef.current = false;
      setIsTypingPrompt(false);
      autoModeCleanupRef.current = null;
      handleSendRef.current(prompt, undefined, undefined, undefined, undefined, true);
    });
  }, []);
  usePubSubListener(CHAI_BUILDER_EVENTS.AI_AUTO_MODE, onAiAutoMode);

  // Handed-off prompt (Style panel / block floating icon), read from the atom
  // instead of delivered live so it survives this panel's lazy mount and the
  // remount right after the sidebar switches to it. Consumed only while idle:
  // a prompt submitted mid-generation waits for the run to finish instead of
  // being dropped by handleSend's busy guard (which would also leak the block
  // scope onto the in-flight run).
  const [pendingAiPrompt, setPendingAiPrompt] = usePendingAiPrompt();
  useEffect(() => {
    if (!pendingAiPrompt || isLoading || isTypingPrompt) return;
    const timer = setTimeout(() => {
      setPendingAiPrompt(null);
      const { prompt, content, blockId, model, autoType, pageId } = pendingAiPrompt;
      // Written on a page we've since navigated away from -- its block is gone.
      if (pageId && currentPageId && pageId !== currentPageId) return;
      if (model) onModelChange?.(model);
      const fire = () => {
        // Scopes just this one turn -- cleared again in onFinish/onError/handleStop above.
        setStyleScopedBlockId(blockId);
        // content = prompt + hidden instruction; prompt alone is the display text.
        handleSendRef.current(prompt, content, undefined, model, undefined, Boolean(autoType));
      };
      if (autoType) {
        autoModeCleanupRef.current?.();
        isTypingPromptRef.current = true;
        setIsTypingPrompt(true);
        autoModeCleanupRef.current = typePromptIntoInput(prompt, setInput, () => {
          isTypingPromptRef.current = false;
          setIsTypingPrompt(false);
          autoModeCleanupRef.current = null;
          fire();
        });
      } else {
        fire();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [pendingAiPrompt, isLoading, isTypingPrompt, currentPageId, onModelChange, setPendingAiPrompt]);

  const parsedError = parseChatTransportError(error);

  return (
    <>
      {/* z-50 keeps the transcript (and its scroll-to-bottom button) clickable
          above the z-40 loading overlay -- same reasoning as the composer below. */}
      <Conversation className={`no-scrollbar px-0 ${isLoading ? "relative z-50" : ""}`}>
        <ConversationContent className="no-scrollbar gap-4 px-0">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<Bot size={30} className="text-foreground/50" />}
              title="Start a conversation"
              description={t("Start a conversation with the AI assistant to add/edit current page")}
            />
          )}
          {messages.map((message: UIMessage) => (
            <Fragment key={message.id}>
              {message.role === "user" ? (
                <AiMessage from="user">
                  <MessageContent className="!p-0">
                    <UserPromptBubble message={message} />
                  </MessageContent>
                </AiMessage>
              ) : (
                message.parts.map((part: any, index: number) => {
                  const partKey = `${message.id}-${index}`;
                  if (part.type === "reasoning") {
                    // Show the thinking, but strip any code so raw markup never leaks in.
                    const reasoningText = stripGeneratedCode(part.text ?? "");
                    if (!reasoningText.trim()) return null;
                    return (
                      <Reasoning
                        key={partKey}
                        isStreaming={part.state === "streaming"}
                        isStopped={wasStopped && part.state === "streaming"}
                        defaultOpen={true}
                        className="gap-0 space-y-0">
                        <ReasoningTrigger className="[&_p]:text-muted-foreground text-xs" />
                        <ReasoningContent className="p-0 text-xs" showLastLinesOnly={2}>
                          {reasoningText}
                        </ReasoningContent>
                      </Reasoning>
                    );
                  }
                  if (part.type === "text") {
                    // Strip any generated code so raw HTML never shows in the chat.
                    const displayText = stripGeneratedCode(part.text ?? "");
                    if (!displayText) return null;
                    return (
                      <AiMessage from="assistant" key={partKey}>
                        <MessageContent className="!p-0">
                          <MessageResponse className="p-0 text-xs">{displayText}</MessageResponse>
                        </MessageContent>
                      </AiMessage>
                    );
                  }
                  if (part.type?.startsWith("tool-")) {
                    return <ToolPartCard key={partKey} part={part} />;
                  }
                  return null;
                })
              )}
            </Fragment>
          ))}
          {queuedSections.length > 0 && (
            <div className="is-assistant text-muted-foreground/50 flex w-full max-w-[94%] flex-col gap-1 text-xs">
              {queuedSections.map((name, i) => (
                <div key={`queued-${completedSections}-${i}`} className="truncate">
                  {name}
                </div>
              ))}
            </div>
          )}
          {/* The request has been sent but nothing has streamed back yet (no reasoning,
              text, or tool call) — without this the panel looks frozen for however long
              the model takes to produce its first byte. Same plain dot+row treatment as
              the real Reasoning trigger below, not a boxed pill — they're both "thinking",
              so they should look identical rather than like two different designs. */}
          {status === "submitted" && (
            <div className="is-assistant text-muted-foreground flex w-full max-w-[94%] items-center gap-2 text-sm">
              <span className="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" />
              <span>Thinking...</span>
            </div>
          )}
          {sectionPlan.length > 0 && (
            <SectionProgress
              sections={sectionPlan}
              completed={completedSections}
              isStreaming={isLoading}
              isHalted={isHalted}
              haltedLabel={sectionPlan[completedSections]}
              onResume={() => handleSend("continue")}
            />
          )}
          {parsedError && (
            <AiMessage from="assistant">
              <MessageContent className="!p-0">
                <MessageResponse className="p-0 text-xs">
                  {getHumanReadableError(new Error(parsedError.message))}
                </MessageResponse>
              </MessageContent>
            </AiMessage>
          )}
          {showTokenWarning && (
            <div className="is-assistant flex w-full items-center gap-2 rounded-md border-l-2 border-amber-500/50 bg-amber-500/5 py-1.5 pr-2.5 pl-2.5 text-xs">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
              <p className="text-muted-foreground min-w-0 flex-1">
                {t("This conversation has a lot of context built up.")}{" "}
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 align-baseline text-amber-600 dark:text-amber-400"
                  onClick={onRequestNewConversation}>
                  {t("Start new conversation")}
                </Button>
              </p>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* z-50 keeps the input (and its Stop button) clickable above the z-40 loading overlay */}
      <div id={AI_PANEL_COMPOSER_ID} className={`border-border pb-2 ${isLoading ? "relative z-50" : ""}`}>
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
            currentBlock={selectedBlock as ChaiBlock}
            disabled={input?.length === 0 || isTypingPrompt}
            selectedModel={currentSelectedModel}
            onModelChange={onModelChange}
          />
        </Suspense>
      </div>
    </>
  );
};

export default AiPanelPageChat;
