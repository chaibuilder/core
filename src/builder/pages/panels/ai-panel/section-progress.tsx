import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "~/lib/utils";

type SectionProgressProps = {
  /** Section labels parsed from the model's plan. */
  sections: string[];
  /** How many sections have finished streaming in. */
  completed: number;
  /** Whether the run is still streaming (drives the header + active row). */
  isStreaming: boolean;
  /** The run ended via a stop or an unrecovered error before every section landed. */
  isHalted?: boolean;
  /** Which section it stopped on, for the halted header ("Stopped on Footer"). */
  haltedLabel?: string;
  /** Resumes a halted run (wired to the same flow "reply continue" already uses). */
  onResume?: () => void;
};

/**
 * Progress checklist for a multi-section generation, rendered inline in the
 * scrolling transcript. Shows each planned section as done / in-progress /
 * pending so the user can watch the page assemble instead of staring at a
 * spinner. Completion is always grey, never green — accent blue is reserved
 * for the active row and header while a build is actually running.
 */
export const SectionProgress = ({
  sections,
  completed,
  isStreaming,
  isHalted = false,
  haltedLabel,
  onResume,
}: SectionProgressProps) => {
  const { t } = useTranslation();
  if (sections.length === 0) return null;

  const done = Math.min(completed, sections.length);
  const percent = Math.round((done / sections.length) * 100);
  const isBuilt = !isStreaming && !isHalted && done >= sections.length;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground/80">
          {isHalted ? (
            <span className="truncate">
              {haltedLabel ? t("Stopped on {{label}}", { label: haltedLabel }) : t("Stopped")}
            </span>
          ) : (
            <span>{isBuilt ? t("Page built") : t("Building page")}</span>
          )}
          {isHalted && onResume && (
            <button
              type="button"
              onClick={onResume}
              className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10">
              {t("Resume")}
            </button>
          )}
        </div>
        <span className={cn("shrink-0 tabular-nums", isStreaming || isBuilt ? "text-primary" : "text-muted-foreground")}>
          {done}/{sections.length}
        </span>
      </div>
      <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-muted-foreground/15">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            isStreaming || isBuilt ? "bg-primary" : "bg-muted-foreground/50",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="space-y-0.5">
        {sections.map((name, i) => {
          const isHaltedHere = isHalted && i === done;
          const status = i < done ? "done" : isHaltedHere ? "halted" : i === done && isStreaming ? "active" : "pending";
          return (
            <li key={`${i}-${name}`} className="flex items-center gap-1.5">
              {status === "done" ? (
                <Check size={12} className="shrink-0 text-muted-foreground/70" />
              ) : status === "active" ? (
                <span className="flex size-3 shrink-0 items-center justify-center">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                </span>
              ) : status === "halted" ? (
                <span className="flex size-3 shrink-0 items-center justify-center">
                  <span className="size-1.5 rounded-full bg-destructive/70" />
                </span>
              ) : (
                <Circle size={12} className="shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  status === "pending"
                    ? "text-muted-foreground/60"
                    : status === "active"
                      ? "font-medium text-foreground"
                      : status === "halted"
                        ? "text-destructive/80"
                        : "text-muted-foreground",
                )}>
                {name}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
