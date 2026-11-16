import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { builderStore } from "~/builder/atoms/store";
import { SCREEN_HEIGHT_VAR } from "~/builder/core/components/canvas/IframeInitialContent";
import { getElementByDataBlockId } from "~/builder/core/components/canvas/static/chai-canvas";
import { revealInNestedScrollers } from "~/builder/core/components/canvas/static/reveal-in-nested-scrollers";
import { useFrame } from "~/builder/core/frame";
import { canvasZoomAtom } from "~/builder/hooks/use-canvas-zoom";
import { useInlineEditing } from "~/builder/hooks/use-inline-editing";
import {
  canvasContentHeightAtom,
  canvasSpacePressedAtom,
  canvasToolAtom,
  canvasWrapperSizeAtom,
  clampZoom,
  isEditableTarget,
  panCanvasBy,
  panCanvasToRevealLocalRect,
  zoomCanvasAtLocalPoint,
} from "~/builder/hooks/use-pannable-canvas";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";

const MAX_CONTENT_HEIGHT = 30000;

/**
 * Renders inside the canvas iframe (a sibling of KeyboardHandler). Two jobs:
 *
 * 1. Attach native gesture listeners to the iframe document — wheel events
 *    fired inside an iframe never bubble to the parent window, so ctrl+wheel
 *    zoom / 2-finger pan / space / V-H shortcuts must be captured here too.
 * 2. In pannable mode the iframe is sized to its full content (the artboard
 *    model), which it reports via a ResizeObserver, and inject CSS that
 *    collapses the default height:100% chain and pins *-screen utilities to
 *    a fixed pixel height. Without the pin, vh-based blocks would resize
 *    with the iframe and create a measure->grow feedback loop.
 */
export const PanZoomHandler = ({ pannable }: { pannable: boolean }) => {
  const { document: iframeDoc } = useFrame();
  const { editingBlockId } = useInlineEditing();
  const viewportHeight = useAtomValue(canvasWrapperSizeAtom).height;
  // Outside pannable mode useCanvasScale keeps this equal to the fit scale x 100.
  const zoom = useAtomValue(canvasZoomAtom);
  const selectedBlock = useSelectedBlock();
  const selectedBlockId = selectedBlock?.type === "Multiple" ? null : (selectedBlock?._id ?? null);

  // Bring a newly selected block into the viewport by panning. Outside
  // pannable mode BlockSelectionHighlighter scrolls the iframe for this; here
  // the iframe is content-sized so that scroll is a no-op, and the wrapper is
  // overflow-clip so nothing else can move the canvas behind the pan state.
  // Outline clicks are the main source of off-screen selections.
  useEffect(() => {
    if (!pannable || !iframeDoc || !selectedBlockId) return;
    const el = getElementByDataBlockId(iframeDoc, selectedBlockId);
    if (!el) return;
    revealInNestedScrollers(el);
    panCanvasToRevealLocalRect(el.getBoundingClientRect());
  }, [pannable, iframeDoc, selectedBlockId]);

  // Report the artboard's content height to the parent. Measured on a
  // trailing debounce so the bursts of resize events during initial load
  // always end with the settled height. The hard cap bounds the rare
  // feedback loop where content height still depends on the iframe height
  // (e.g. an arbitrary h-[120vh]): each applied growth re-triggers the
  // observer, but growth stops at the cap.
  useEffect(() => {
    if (!pannable || !iframeDoc?.documentElement) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const height = iframeDoc.documentElement.scrollHeight;
      builderStore.set(canvasContentHeightAtom, Math.min(Math.max(height, 100), MAX_CONTENT_HEIGHT));
    };
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(measure, 150);
    });
    observer.observe(iframeDoc.documentElement);
    measure();
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [pannable, iframeDoc]);

  // No mode-toggle hotkey here either (see usePanZoom): the mode is entered
  // from the canvas topbar menu only.

  // Gesture + keyboard listeners on the iframe document.
  useEffect(() => {
    if (!pannable || !iframeDoc) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const nextZoom = clampZoom(builderStore.get(canvasZoomAtom) * Math.exp(-e.deltaY * 0.01));
        zoomCanvasAtLocalPoint(nextZoom, e.clientX, e.clientY);
        return;
      }
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      panCanvasBy(-dx, -dy);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (editingBlockId || isEditableTarget(e.target)) return;
      if (e.code === "Space") {
        if (!e.repeat) {
          e.preventDefault();
          builderStore.set(canvasSpacePressedAtom, true);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "v" || e.key === "V" || e.key === "Escape") builderStore.set(canvasToolAtom, "select");
      if (e.key === "h" || e.key === "H") builderStore.set(canvasToolAtom, "hand");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") builderStore.set(canvasSpacePressedAtom, false);
    };

    // Middle-mouse drag pan. clientX/clientY are iframe-local and shift as
    // the canvas pans (corrupting deltas), so track screenX/screenY which
    // are unaffected by the iframe transform.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      dragging = true;
      lastX = e.screenX;
      lastY = e.screenY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      panCanvasBy(e.screenX - lastX, e.screenY - lastY);
      lastX = e.screenX;
      lastY = e.screenY;
    };
    const onMouseUp = () => {
      dragging = false;
    };

    iframeDoc.addEventListener("wheel", onWheel, { passive: false });
    iframeDoc.addEventListener("keydown", onKeyDown);
    iframeDoc.addEventListener("keyup", onKeyUp);
    iframeDoc.addEventListener("mousedown", onMouseDown);
    iframeDoc.addEventListener("mousemove", onMouseMove);
    iframeDoc.addEventListener("mouseup", onMouseUp);
    iframeDoc.addEventListener("mouseleave", onMouseUp);
    return () => {
      iframeDoc.removeEventListener("wheel", onWheel);
      iframeDoc.removeEventListener("keydown", onKeyDown);
      iframeDoc.removeEventListener("keyup", onKeyUp);
      iframeDoc.removeEventListener("mousedown", onMouseDown);
      iframeDoc.removeEventListener("mousemove", onMouseMove);
      iframeDoc.removeEventListener("mouseup", onMouseUp);
      iframeDoc.removeEventListener("mouseleave", onMouseUp);
    };
  }, [pannable, iframeDoc, editingBlockId]);

  if (!pannable) {
    // Fit-to-width mode scales the iframe down and stretches its height by
    // 1/scale, so a raw 100vh always fills the whole visible canvas and a
    // desktop h-screen section looks near-square. Shrink the screen height by
    // the same scale so it keeps the proportions of a real screen that wide.
    // No scale (e.g. mobile) means zoom is 100 and plain vh applies.
    if (zoom >= 100) return null;
    return <style>{`:root { ${SCREEN_HEIGHT_VAR}: calc(100vh * ${zoom / 100}); }`}</style>;
  }

  // "Screen" height for vh-like utilities while the iframe is content-sized:
  // what one viewport-full looked like before entering pannable mode.
  const screenHeight = Math.round(Math.max(viewportHeight, 400));
  return (
    <style>{`
      html { height: auto !important; overflow: hidden !important; }
      body { height: auto !important; }
      :root { ${SCREEN_HEIGHT_VAR}: ${screenHeight}px; }
    `}</style>
  );
};
