"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ChaiIFrameWindow, type ChaiIFrameWindowHandle } from "~/components/ChaiIFrameWindow";

/**
 * Resolves an editUrl template by replacing {{ID}} with the provided id.
 * e.g. "/admin/embed/collections/posts/{{ID}}" + "abc123" -> "/admin/embed/collections/posts/abc123"
 */
export function resolveEditUrl(template: string, id: string): string {
  return template.replace(/\{\{ID\}\}/g, id);
}

/** Returns true if url is same-origin as the current page (or is a relative path). */
function isSameOrigin(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

interface EditUrlPanelProps {
  url: string;
  label?: string;
  onClose: () => void;
}

export function EditUrlPanel({ url, label, onClose }: EditUrlPanelProps) {
  const { t } = useTranslation();
  const allowed = useMemo(() => isSameOrigin(url), [url]);
  const [open, setOpen] = useState(true);
  const iframeRef = useRef<ChaiIFrameWindowHandle>(null);
  const isClosingRef = useRef(false);

  const handleOpenChange = useCallback(
    async (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }

      if (isClosingRef.current) {
        return;
      }

      if (!allowed) {
        setOpen(false);
        onClose();
        return;
      }

      isClosingRef.current = true;
      const canClose = (await iframeRef.current?.requestClose()) ?? true;
      isClosingRef.current = false;

      if (canClose) {
        setOpen(false);
        onClose();
      }
    },
    [allowed, onClose],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] min-h-[70vh] min-w-[80%] flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}>
        {/* pr-10 leaves room for built-in DialogPrimitive.Close button */}
        <DialogHeader className="flex flex-row items-center justify-between border-b px-4 py-2.5 pr-10">
          <DialogTitle className="text-xs font-medium">{label ?? t("Edit")}</DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 overflow-hidden" style={{ height: "calc(80vh - 48px)" }}>
          {!allowed ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <p className="font-medium text-destructive">{t("Cross-origin URL blocked")}</p>
              <p className="max-w-xs text-xs">
                {t("Only same-domain URLs are allowed in the edit panel.")}
                <br />
                <span className="mt-1 block break-all font-mono text-[10px] opacity-70">{url}</span>
              </p>
            </div>
          ) : (
            <ChaiIFrameWindow
              ref={iframeRef}
              src={url}
              deferInvalidation
              className="absolute inset-0 h-full w-full border-0"
              title={label ?? t("Edit")}
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
