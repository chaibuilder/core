import { noop } from "lodash-es";
import { Eye } from "lucide-react";
import React, { Suspense, useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import StaticCanvas from "~/builder/core/components/canvas/static/static-canvas";
import { FallbackError } from "~/builder/core/components/fallback-error";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useCanvasIframe } from "~/builder/hooks/use-canvas-iframe";
import { useCodeEditor } from "~/builder/hooks/use-code-editor";
import { panCanvasBy, usePannableCanvas } from "~/builder/hooks/use-pannable-canvas";
import { useReadOnlyMode } from "~/builder/hooks/use-read-only-mode";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { Skeleton } from "~/components/ui/skeleton";
import { CanvasTopBar } from "./topbar/canvas-top-bar";

const CodeEditor = React.lazy(() => import("~/builder/core/components/canvas/static/code-editor"));

/**
 * Covers a view-only page's canvas so nothing in it can be hovered, selected or edited. The
 * mouse wheel still scrolls the page underneath, or pans the canvas in pannable mode.
 */
const ReadOnlyCanvasOverlay = ({ reason, action }: { reason: string; action?: React.ReactNode }) => {
  const [iframe] = useCanvasIframe();
  const [pannable] = usePannableCanvas();
  const [, setSelectedIds] = useSelectedBlockIds();
  // A selection made before the page turned view-only would keep its block toolbar.
  useEffect(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);
  return (
    <div
      data-testid="read-only-canvas-overlay"
      className="absolute inset-x-0 bottom-0 top-10 z-10 flex justify-center"
      onWheel={(e) =>
        // In pannable mode the iframe is as tall as its page, so the wheel pans the canvas instead.
        pannable
          ? panCanvasBy(-e.deltaX, -e.deltaY)
          : (iframe as HTMLIFrameElement | null)?.contentWindow?.scrollBy(e.deltaX, e.deltaY)
      }>
      <div className="mt-2 flex h-fit items-center gap-3 rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm">
        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{reason}</span>
        {action}
      </div>
    </div>
  );
};

const CanvasArea: React.FC = () => {
  const [codeEditor] = useCodeEditor();
  const onErrorFn = useBuilderProp("onError", noop);
  const readOnly = useReadOnlyMode();
  return (
    <div className="flex h-full max-h-full w-full flex-1 flex-col">
      <div className="relative flex h-full max-h-full flex-col overflow-hidden">
        <CanvasTopBar />
        <Suspense fallback={<Skeleton className="h-full" />}>
          <ErrorBoundary fallback={<FallbackError />} onError={onErrorFn}>
            <StaticCanvas />
          </ErrorBoundary>
        </Suspense>
        {readOnly ? <ReadOnlyCanvasOverlay reason={readOnly.reason} action={readOnly.action} /> : null}
        {codeEditor && !readOnly ? (
          <Suspense fallback={<Skeleton className="h-full" />}>
            <CodeEditor />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
};

export default CanvasArea;
