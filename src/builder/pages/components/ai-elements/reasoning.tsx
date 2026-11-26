"use client";

import { useControllableState } from "~/utils/vendor/use-controllable-state";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, memo, startTransition, useContext, useEffect, useState } from "react";
import i18n from "~/builder/core/locales/load";
import { Streamdown } from "streamdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/builder/pages/components/ui/collapsible";
import { cn } from "~/lib/utils";

type ReasoningContextValue = {
  isStreaming: boolean;
  isStopped: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
  elapsedSeconds: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  /** The run was stopped while this block was still streaming — freeze it, label "Thinking stopped". */
  isStopped?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    isStopped = false,
    open,
    defaultOpen = true,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });
    const [duration, setDuration] = useControllableState({
      prop: durationProp,
      defaultProp: undefined,
    });

    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          startTransition(() => setStartTime(Date.now()));
        }
      } else if (startTime !== null) {
        setDuration(Math.ceil((Date.now() - startTime) / MS_IN_S));
        startTransition(() => {
          setStartTime(null);
          setElapsedSeconds(0);
        });
      }
    }, [isStreaming, startTime, setDuration]);

    // Update elapsed time every second while streaming
    useEffect(() => {
      if (!isStreaming || startTime === null) return;

      const interval = setInterval(() => {
        startTransition(() => {
          setElapsedSeconds(Math.floor((Date.now() - startTime) / MS_IN_S));
        });
      }, MS_IN_S);

      return () => clearInterval(interval);
    }, [isStreaming, startTime]);

    // Collapse the instant streaming ends — a settled block is a single
    // skimmable hairline row, not something to linger open. Never re-closes
    // once the user has reopened it (hasAutoClosed latches after the first run).
    useEffect(() => {
      // isStopped is its own end-of-stream signal -- the SDK's reasoning part
      // can stay isStreaming=true after a user Stop, since nothing ever marks
      // it done. Without this, a stopped mid-thought block never collapses
      // even though its label already reads "Thinking stopped".
      if (defaultOpen && (!isStreaming || isStopped) && isOpen && !hasAutoClosed) {
        setIsOpen(false);
        setHasAutoClosed(true);
      }
    }, [isStreaming, isStopped, isOpen, defaultOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen);
    };

    return (
      <ReasoningContext.Provider value={{ isStreaming, isStopped, isOpen, setIsOpen, duration, elapsedSeconds }}>
        <Collapsible
          className={cn("not-prose mb-1.5 w-full max-w-[94%]", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}>
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

const ThinkingDot = () => <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />;

export const getThinkingLabel = (isStreaming: boolean, isStopped: boolean, duration?: number, elapsedSeconds?: number) => {
  if (isStopped) return i18n.t("Thinking stopped");
  if (isStreaming)
    return elapsedSeconds && elapsedSeconds > 0
      ? i18n.t("Thinking... {{seconds}}s", { seconds: elapsedSeconds })
      : i18n.t("Thinking...");
  if (duration === undefined || duration === 0) return i18n.t("Thought for a few seconds");
  return i18n.t("Thought for {{duration}} seconds", { duration });
};

export const ReasoningTrigger = memo(({ className, children, ...props }: ReasoningTriggerProps) => {
  const { isStreaming, isStopped, isOpen, duration, elapsedSeconds } = useReasoning();
  const showDot = isStreaming && !isStopped;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}>
      {children ?? (
        <>
          {showDot && <ThinkingDot />}
          <span>{getThinkingLabel(isStreaming, isStopped, duration, elapsedSeconds)}</span>
          <ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
        </>
      )}
    </CollapsibleTrigger>
  );
});

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
  showLastLinesOnly?: number;
};

/**
 * Get the last N lines from a string
 */
export const getLastLines = (text: string, lineCount: number): string => {
  if (!text) return "";
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length <= lineCount) return text;
  return lines.slice(-lineCount).join("\n");
};

export const ReasoningContent = memo(({ className, children, showLastLinesOnly, ...props }: ReasoningContentProps) => {
  const { isStreaming, isStopped } = useReasoning();

  // When streaming, show only the last N lines if specified
  const displayContent = isStreaming && showLastLinesOnly ? getLastLines(children, showLastLinesOnly) : children;

  return (
    <CollapsibleContent
      className={cn(
        "mt-2 border-l-2 border-muted-foreground/25 text-sm",
        "text-muted-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        className,
      )}
      {...props}>
      {/* Padding lives on this inner wrapper, not the element above -- callers
          pass className="p-0 ..." there to reset text size, and a plain p-*
          would silently cancel a pl-* set on the same element via
          tailwind-merge. */}
      <div
        className={cn(
          "pl-1.5",
          // Streamdown's default prose-style spacing reads as scattered at this
          // scale -- tighten the vertical rhythm between paragraphs/list items.
          "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5",
        )}>
        <Streamdown>{displayContent}</Streamdown>
        {isStreaming && !isStopped && (
          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground align-text-bottom" />
        )}
      </div>
    </CollapsibleContent>
  );
});

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
