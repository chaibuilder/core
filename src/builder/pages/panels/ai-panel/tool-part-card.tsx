"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "~/lib/utils";

type ToolPartLike = {
  type: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  edit_block: { active: "Updating section…", done: "Updated section" },
  add_blocks: { active: "Adding new content…", done: "Added new content" },
  remove_blocks: { active: "Removing content…", done: "Removed content" },
  add_custom_block: { active: "Adding block…", done: "Added block" },
  bind_prop: { active: "Connecting data…", done: "Connected data" },
  read_block_html: { active: "Reviewing the page…", done: "Reviewed the page" },
  get_partial_blocks: { active: "Checking shared sections…", done: "Checked shared sections" },
  get_pages_list: { active: "Looking up site pages…", done: "Looked up site pages" },
};

const getToolNameFromPartType = (type: string) => type.replace(/^tool-/, "");

const getLabel = (part: ToolPartLike, isFailed: boolean): string => {
  const toolName = getToolNameFromPartType(part.type);
  const input = (part.input ?? {}) as Record<string, any>;
  const isDone = !isFailed && (part.state === "output-available" || part.state === "output-error");
  const task = typeof input.task === "string" && input.task.trim().length > 0 ? input.task : null;
  if (task) return isFailed || isDone ? task : `${task}…`;
  const labels = TOOL_LABELS[toolName];
  if (isFailed) return labels ? labels.active : "Working…";
  if (!labels) return isDone ? "Done" : "Working…";
  return isDone ? labels.done : labels.active;
};

/**
 * Renders one tool invocation as a plain transcript row — never boxed, so it
 * reads at the same weight as a thinking or reply row. This is the panel's
 * one rotating spinner (running only); done/failed are static markers.
 */
export const ToolPartCard = ({ part, className }: { part: ToolPartLike; className?: string }) => {
  const output = part.output as { ok?: boolean; error?: string } | undefined;
  const isFailed = part.state === "output-error" || output?.ok === false;
  const isDone = part.state === "output-available" && !isFailed;
  const isRunning = !isDone && !isFailed;
  const label = getLabel(part, isFailed);
  // Only ever show OUR OWN error strings (written inside a tool's execute(),
  // e.g. "No stock photo found for this query.") -- never part.errorText,
  // which is the AI SDK's raw internal message for a tool call that failed
  // input-schema validation before execute() ever ran (e.g. a Zod "too_big"
  // dump). The model already sees and self-corrects from that raw message on
  // its own next turn; the user should never have to read it.
  const errorText = output?.error;

  return (
    <div className={cn("is-assistant flex w-full max-w-[94%] flex-col gap-2", className)}>
      <div className="flex w-full flex-col gap-1 overflow-hidden text-xs">
        {isRunning && (
          <div className="flex items-baseline gap-2 font-medium text-foreground">
            <span className="flex h-[1.5em] w-2.5 shrink-0 items-center justify-center">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            </span>
            <span className="min-w-0 flex-1 leading-normal">{label}</span>
          </div>
        )}
        {isDone && (
          <div className="flex items-baseline gap-2 text-muted-foreground">
            <span className="flex h-[1.5em] w-2.5 shrink-0 items-center justify-center">
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
            </span>
            <span className="min-w-0 flex-1 leading-normal">{label}</span>
          </div>
        )}
        {isFailed && (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-destructive/80">
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              <span className="min-w-0 flex-1 leading-normal">{label}</span>
            </div>
            {errorText && <div className="text-[11px] text-destructive/70">{errorText}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
