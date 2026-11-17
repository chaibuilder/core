import { isEmpty } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockSelectionHighlighter } from "~/builder/core/components/canvas/block-floating-actions";
import { useDragAndDrop, useDropIndicator } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { getIframeInitialContent } from "~/builder/core/components/canvas/IframeInitialContent";
import { KeyboardHandler } from "~/builder/core/components/canvas/keyboar-handler";
import { AddBlockAtBottom } from "~/builder/core/components/canvas/static/add-block-at-bottom";
import { Canvas } from "~/builder/core/components/canvas/static/chai-canvas";
import { HeadTags } from "~/builder/core/components/canvas/static/head-tags";
import { PanZoomHandler } from "~/builder/core/components/canvas/static/pan-zoom-handler";
import { PanZoomOverlay } from "~/builder/core/components/canvas/static/pan-zoom-overlay";
import { ResizableCanvasWrapper } from "~/builder/core/components/canvas/static/resizable-canvas-wrapper";
import { StaticBlocksRenderer } from "~/builder/core/components/canvas/static/static-blocks-renderer";
import { useCanvasScale } from "~/builder/core/components/canvas/static/use-canvas-scale";
import { usePanZoom } from "~/builder/core/components/canvas/static/use-pan-zoom";
import { ChaiFrame } from "~/builder/core/frame";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useCanvasIframe } from "~/builder/hooks/use-canvas-iframe";
import { useHighlightBlockId } from "~/builder/hooks/use-highlight-blockId";
import { usePannableCanvas } from "~/builder/hooks/use-pannable-canvas";
import { useCanvasDisplayWidth } from "~/builder/hooks/use-screen-size-width";
import { Skeleton } from "~/components/ui/skeleton";
import { CanvasEventsWatcher } from "./canvas-events-watcher";

const StaticCanvas = () => {
  const [width] = useCanvasDisplayWidth();
  const [, highlight] = useHighlightBlockId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimension, setDimension] = useState({ width: 0, height: 0 });
  const [pannable] = usePannableCanvas();
  const scale = useCanvasScale(dimension, { disabled: pannable });
  const { style: panZoomStyle } = usePanZoom({ dimension, wrapperRef });
  const [, setCanvasIframe] = useCanvasIframe();
  const loadingCanvas = useBuilderProp("loading", false);
  const htmlDir = useBuilderProp("htmlDir", "ltr");
  const { onDragOver, onDrop, onDragEnd } = useDragAndDrop();
  const dropIndicator = useDropIndicator();

  const setNewWidth = useCallback(
    (newWidth: number) => {
      setDimension((prev) => ({ ...prev, width: newWidth }));
    },
    [setDimension],
  );

  useEffect(() => {
    if (!wrapperRef.current) return;
    const { clientWidth, clientHeight } = wrapperRef.current as HTMLDivElement;
    setDimension({ width: clientWidth, height: clientHeight });
  }, [wrapperRef, width]);

  const iframeContent: string = useMemo(() => getIframeInitialContent({ htmlDir }), [htmlDir]);

  return (
    <ResizableCanvasWrapper onMount={setNewWidth} onResize={setNewWidth}>
      <div
        onMouseLeave={() => setTimeout(() => highlight(""), 300)}
        // While pannable this wrapper IS the viewport, so it must coincide with
        // the dotted backdrop: it stretches over ResizableCanvasWrapper's 24px
        // transparent side borders (negative margins), otherwise the artboard
        // is cut 24px before the dots end and content looks like it vanished.
        // The 24px / 48px below are that gutter and twice it — keep them equal
        // to ResizableCanvasWrapper's `border-x-[24px]` if the gutter changes.
        // overflow-clip (not hidden): the transformed iframe extends past the
        // wrapper, and a scrolling box would let scrollIntoView calls from
        // inside the iframe scroll the wrapper itself — a displacement the pan
        // state never sees. Clip makes it non-scrollable; PanZoomHandler pans
        // to reveal the selected block instead.
        className={`relative h-full pt-6 ${
          pannable ? "-mx-[24px] w-[calc(100%_+_48px)] overflow-clip" : "mx-auto w-full overflow-hidden"
        }`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        ref={wrapperRef}>
        <ChaiFrame
          contentDidMount={() => setCanvasIframe(iframeRef.current as HTMLIFrameElement)}
          ref={iframeRef as React.RefObject<HTMLIFrameElement>}
          id="canvas-iframe"
          style={
            pannable
              ? (panZoomStyle ?? {})
              : {
                  ...scale,
                  ...(isEmpty(scale) ? { width: `${width}px` } : {}),
                }
          }
          className={`relative mx-auto box-content h-full w-full max-w-full ${
            pannable ? "shadow-lg" : "transition-all duration-300 ease-linear"
          }`}
          initialContent={iframeContent}>
          <KeyboardHandler />
          <PanZoomHandler pannable={pannable} />
          <BlockSelectionHighlighter />
          <HeadTags />
          <Canvas>
            {loadingCanvas ? (
              <div className="h-full p-4">
                <Skeleton className="h-full" />
              </div>
            ) : (
              <StaticBlocksRenderer />
            )}
            <AddBlockAtBottom />
          </Canvas>
          <CanvasEventsWatcher />
          <>
            {dropIndicator.isVisible && (
              <div
                id="placeholder"
                className={`pointer-events-none absolute z-[99999] max-w-full ${
                  dropIndicator.isEmpty
                    ? "bg-purple-500/10 outline-2 -outline-offset-4 outline-purple-500 outline-dashed"
                    : "rounded-full bg-green-500"
                }`}
                style={{
                  top: dropIndicator.top,
                  left: dropIndicator.left,
                  width: dropIndicator.width,
                  height: dropIndicator.height,
                }}
              />
            )}
          </>
        </ChaiFrame>
        {pannable && <PanZoomOverlay />}
      </div>
    </ResizableCanvasWrapper>
  );
};

export default StaticCanvas;
