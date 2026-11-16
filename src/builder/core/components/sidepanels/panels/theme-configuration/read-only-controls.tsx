import type * as React from "react";
import { cn } from "~/builder/core/functions/common-functions";
import Tooltip from "~/builder/pages/utils/tooltip";

interface ReadOnlyControlsProps {
  /** `false` renders `children` untouched — the caller does not branch, this component does. */
  disabled: boolean;
  /** Hover copy. Names *who* owns these values; "disabled" on its own reads as broken. */
  reason: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Controls something above the author owns: visible, showing their real values, and not editable.
 *
 * **Visible, not hidden.** An author opening the theme panel wants to see the colours their site
 * uses; hiding them reads as "missing" and produces a bug report. The tooltip is doing the real
 * work here — it is the difference between understanding the model and filing that report.
 *
 * **Not editable, because every control here saves the *whole* theme object** into the site's
 * theme (`use-save-website-data.ts` → `update-website-fields.ts`), so a single nudge rewrites
 * every token. Read-only means there is nothing to save.
 *
 * **Presentation, never the guarantee.** Whether the write is actually allowed is the host's to
 * decide server-side; this wrapper only reflects the answer it was handed (`themeReadOnly`). It
 * knows nothing about *why* — host-owned styles, account locks and plan tiers all reduce to the same flag
 * and a different `reason`, which is why there is one wrapper rather than one per cause.
 *
 * Two nested elements on purpose: `inert` neutralises pointer *and* keyboard interaction, but it
 * would also swallow the hover that opens the tooltip — so the tooltip trigger sits outside it.
 */
export const ReadOnlyControls: React.FC<ReadOnlyControlsProps> = ({ disabled, reason, children, className }) => {
  if (!disabled) return <>{children}</>;

  return (
    <Tooltip content={reason} side="left">
      <div
        className={cn("cursor-not-allowed", className)}
        aria-disabled="true"
        data-theme-read-only="true"
        data-tooltip={reason}>
        <div inert className="pointer-events-none select-none opacity-60">
          {children}
        </div>
      </div>
    </Tooltip>
  );
};
