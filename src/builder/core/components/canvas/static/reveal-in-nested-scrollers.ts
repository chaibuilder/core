/**
 * Scrolls every scrollable ancestor INSIDE the iframe document (a carousel
 * track, a tabs strip, an overflow-auto box) so `el` is visible — the nested
 * half of `scrollIntoView({ block: "nearest", inline: "nearest" })`.
 *
 * Not `scrollIntoView` itself: that also moves the builder's wrapper around
 * the iframe (overflow-hidden boxes scroll programmatically), a displacement
 * the canvas scroll / pan state never sees. The document's own scroll is left
 * to the callers (BlockSelectionHighlighter scrolls the iframe window,
 * PanZoomHandler pans the artboard) — they measure AFTER this ran.
 *
 * Snap containers align the selected element's containing snap area. Other
 * scrollers use nearest-edge visibility.
 */
export const revealInNestedScrollers = (el: HTMLElement) => {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  const isScrollable = (overflow: string) => overflow === "auto" || overflow === "scroll";
  const nearestDelta = (start: number, end: number, boxStart: number, boxEnd: number) => {
    if (start < boxStart) return start - boxStart;
    if (end > boxEnd) return Math.min(start - boxStart, end - boxEnd);
    return 0;
  };
  const length = (value: string) => Number.parseFloat(value) || 0;
  const snapAxisEnabled = (snapType: string, axis: "x" | "y") => {
    const snapAxis = snapType.split(/\s+/)[0];
    return snapAxis === axis || snapAxis === "both" || (axis === "x" ? snapAxis === "inline" : snapAxis === "block");
  };
  const findSnapArea = (scroller: HTMLElement, axis: "x" | "y") => {
    if (!snapAxisEnabled(win.getComputedStyle(scroller).scrollSnapType, axis)) return null;
    for (let node: HTMLElement | null = el; node && node !== scroller; node = node.parentElement) {
      const values = win.getComputedStyle(node).scrollSnapAlign.trim().split(/\s+/);
      const alignment = values.length === 1 ? values[0] : values[axis === "x" ? 1 : 0];
      if (alignment && alignment !== "none") return { node, alignment };
    }
    return null;
  };
  const snapDelta = (
    start: number,
    end: number,
    boxStart: number,
    boxEnd: number,
    alignment: string,
    marginStart: number,
    marginEnd: number,
    paddingStart: number,
    paddingEnd: number,
  ) => {
    const areaStart = start - marginStart;
    const areaEnd = end + marginEnd;
    const snapportStart = boxStart + paddingStart;
    const snapportEnd = boxEnd - paddingEnd;
    if (alignment === "center") return (areaStart + areaEnd - snapportStart - snapportEnd) / 2;
    if (alignment === "end") return areaEnd - snapportEnd;
    return areaStart - snapportStart;
  };

  for (let p = el.parentElement; p && p !== doc.body && p !== doc.documentElement; p = p.parentElement) {
    const style = win.getComputedStyle(p);
    const { overflowX, overflowY } = style;
    const canX = isScrollable(overflowX) && p.scrollWidth > p.clientWidth;
    const canY = isScrollable(overflowY) && p.scrollHeight > p.clientHeight;
    if (!canX && !canY) continue;
    const pr = p.getBoundingClientRect();
    const boxLeft = pr.left + p.clientLeft;
    const boxTop = pr.top + p.clientTop;
    const boxRight = boxLeft + p.clientWidth;
    const boxBottom = boxTop + p.clientHeight;
    let xDelta = 0;
    let yDelta = 0;

    if (canX) {
      const snapArea = findSnapArea(p, "x");
      const target = snapArea?.node ?? el;
      const r = target.getBoundingClientRect();
      if (snapArea) {
        const targetStyle = win.getComputedStyle(target);
        xDelta = snapDelta(
          r.left,
          r.right,
          boxLeft,
          boxRight,
          snapArea.alignment,
          length(targetStyle.scrollMarginLeft),
          length(targetStyle.scrollMarginRight),
          length(style.scrollPaddingLeft),
          length(style.scrollPaddingRight),
        );
      } else {
        xDelta = nearestDelta(r.left, r.right, boxLeft, boxRight);
      }
    }
    if (canY) {
      const snapArea = findSnapArea(p, "y");
      const target = snapArea?.node ?? el;
      const r = target.getBoundingClientRect();
      if (snapArea) {
        const targetStyle = win.getComputedStyle(target);
        yDelta = snapDelta(
          r.top,
          r.bottom,
          boxTop,
          boxBottom,
          snapArea.alignment,
          length(targetStyle.scrollMarginTop),
          length(targetStyle.scrollMarginBottom),
          length(style.scrollPaddingTop),
          length(style.scrollPaddingBottom),
        );
      } else {
        yDelta = nearestDelta(r.top, r.bottom, boxTop, boxBottom);
      }
    }
    if (xDelta || yDelta) {
      p.scrollTo({ left: p.scrollLeft + xDelta, top: p.scrollTop + yDelta, behavior: "instant" });
    }
  }
};
