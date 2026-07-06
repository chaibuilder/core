// @ts-nochecks

import { Provider as JotaiProvider } from "jotai";
import { isEmpty } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Provider as BalancerProvider } from "react-wrap-balancer";
import { builderStore } from "~/atoms/store";
import { Skeleton } from "~/components/ui/skeleton";
import { BlockSelectionHighlighter } from "~/core/components/canvas/block-floating-actions";
import { useDragAndDrop, useDropIndicator } from "~/core/components/canvas/dnd/drag-and-drop/hooks";
import { IframeInitialContent } from "~/core/components/canvas/IframeInitialContent";
import { KeyboardHandler } from "~/core/components/canvas/keyboar-handler";
import { AddBlockAtBottom } from "~/core/components/canvas/static/add-block-at-bottom";
import { Canvas } from "~/core/components/canvas/static/chai-canvas";
import { HeadTags } from "~/core/components/canvas/static/head-tags";
import { ResizableCanvasWrapper } from "~/core/components/canvas/static/resizable-canvas-wrapper";
import { StaticBlocksRenderer } from "~/core/components/canvas/static/static-blocks-renderer";
import { useCanvasScale } from "~/core/components/canvas/static/use-canvas-scale";
import { ChaiFrame } from "~/core/frame";
import { useBuilderProp } from "~/hooks/use-builder-prop";
import { useCanvasIframe } from "~/hooks/use-canvas-iframe";
import { useHighlightBlockId } from "~/hooks/use-highlight-blockId";
import { useCanvasDisplayWidth } from "~/hooks/use-screen-size-width";
import { CanvasEventsWatcher } from "./canvas-events-watcher";

const StaticCanvas = () => {
  const [width] = useCanvasDisplayWidth();
  const [, highlight] = useHighlightBlockId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimension, setDimension] = useState({ width: 0, height: 0 });
  const scale = useCanvasScale(dimension);
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

  const iframeContent: string = useMemo(() => {
    let initialHTML = IframeInitialContent;
    initialHTML = initialHTML.replace("__HTML_DIR__", htmlDir);
    return initialHTML;
  }, [htmlDir]);

  return (
    <ResizableCanvasWrapper onMount={setNewWidth} onResize={setNewWidth}>
      <div
        onMouseLeave={() => setTimeout(() => highlight(""), 300)}
        className="relative mx-auto h-full w-full overflow-hidden"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        ref={wrapperRef}>
        {/*// @ts-ignore*/}
        <ChaiFrame
          contentDidMount={() => setCanvasIframe(iframeRef.current as HTMLIFrameElement)}
          ref={iframeRef as any}
          id="canvas-iframe"
          style={{ ...scale, ...(isEmpty(scale) ? { width: `${width}px` } : {}) }}
          className="relative mx-auto box-content h-full w-full max-w-full shadow-lg transition-all duration-300 ease-linear"
          initialContent={iframeContent}>
          <KeyboardHandler />
          <BlockSelectionHighlighter />
          <HeadTags />
          <JotaiProvider store={builderStore}>
            <BalancerProvider>
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
            </BalancerProvider>
          </JotaiProvider>
          {dropIndicator.isVisible && (
            <div
              id="placeholder"
              className={`pointer-events-none absolute z-[99999] max-w-full transition-all duration-150 ${
                dropIndicator.isEmpty
                  ? "bg-purple-500/10 outline-dashed outline-2 -outline-offset-2 outline-purple-500"
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
        </ChaiFrame>
      </div>
    </ResizableCanvasWrapper>
  );
};

export default StaticCanvas;
