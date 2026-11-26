"use client";

import type { TFunction } from "i18next";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "~/lib/utils";

type ToolPartLike = {
  type: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const getToolLabels = (t: TFunction): Record<string, { active: string; done: string }> => ({
  read_blocks: { active: t("Reading block details…"), done: t("Read block details") },
  update_block_props: { active: t("Updating block…"), done: t("Updated block") },
  edit_block: { active: t("Updating section…"), done: t("Updated section") },
  add_blocks: { active: t("Adding new content…"), done: t("Added new content") },
  remove_blocks: { active: t("Removing content…"), done: t("Removed content") },
  add_custom_block: { active: t("Adding block…"), done: t("Added block") },
  get_library_blocks: { active: t("Browsing block library…"), done: t("Checked block library") },
  add_library_block: { active: t("Adding library block…"), done: t("Added library block") },
  bind_prop: { active: t("Connecting data…"), done: t("Connected data") },
  read_block_html: { active: t("Reviewing the page…"), done: t("Reviewed the page") },
  get_page_blocks: { active: t("Inspecting page structure…"), done: t("Inspected page structure") },
  get_partial_blocks: { active: t("Checking shared sections…"), done: t("Checked shared sections") },
  get_pages_list: { active: t("Looking up site pages…"), done: t("Looked up site pages") },
  get_block_translations: { active: t("Reading translations…"), done: t("Read translations") },
  update_block_translations: { active: t("Updating translations…"), done: t("Updated translations") },
  get_page_seo: { active: t("Reading page SEO…"), done: t("Read page SEO") },
  update_page_seo: { active: t("Updating page SEO…"), done: t("Updated page SEO") },
  upload_image: { active: t("Uploading image…"), done: t("Uploaded image") },
  get_design_system: { active: t("Reading design system…"), done: t("Read design system") },
  save_design_system: { active: t("Saving design system…"), done: t("Saved design system") },
  check_page_design: { active: t("Checking page design…"), done: t("Checked page design") },
  get_design_guide: { active: t("Reading design playbook…"), done: t("Read design playbook") },
});

const getToolNameFromPartType = (type: string) => type.replace(/^tool-/, "");

const getLabel = (part: ToolPartLike, isFailed: boolean, t: TFunction): string => {
  const toolName = getToolNameFromPartType(part.type);
  const input = (part.input ?? {}) as Record<string, any>;
  const isDone = !isFailed && (part.state === "output-available" || part.state === "output-error");
  const task = typeof input.task === "string" && input.task.trim().length > 0 ? input.task : null;
  if (task) return isFailed || isDone ? task : `${task}…`;
  const labels = getToolLabels(t)[toolName];
  if (isFailed) return labels ? labels.active : t("Working…");
  if (!labels) return isDone ? t("Done") : t("Working…");
  return isDone ? labels.done : labels.active;
};

/**
 * Renders one tool invocation as a plain transcript row — never boxed, so it
 * reads at the same weight as a thinking or reply row. This is the panel's
 * one rotating spinner (running only); done/failed are static markers.
 */
export const ToolPartCard = ({ part, className }: { part: ToolPartLike; className?: string }) => {
  const { t } = useTranslation();
  const output = part.output as { ok?: boolean; error?: string } | undefined;
  const isFailed = part.state === "output-error" || output?.ok === false;
  const isDone = part.state === "output-available" && !isFailed;
  const isRunning = !isDone && !isFailed;
  const label = getLabel(part, isFailed, t);
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
