// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { revealInNestedScrollers } from "./reveal-in-nested-scrollers";

// No layout in happy-dom: rects and scroll metrics are stubbed per element.
type Rect = { left: number; right: number; top: number; bottom: number };
type Size = {
  scrollWidth?: number;
  clientWidth?: number;
  scrollHeight?: number;
  clientHeight?: number;
  clientLeft?: number;
  clientTop?: number;
};
const layout = (el: HTMLElement, rect: Rect, size?: Size) => {
  el.getBoundingClientRect = () =>
    ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect;
  if (size) {
    for (const [property, value] of Object.entries(size)) {
      Object.defineProperty(el, property, { value, configurable: true });
    }
  }
};

const build = () => {
  // body > outer(overflow hidden) > viewport(overflow-x auto) > track > slide > target
  const outer = document.createElement("div");
  outer.style.overflow = "hidden";
  const viewport = document.createElement("div");
  viewport.style.overflowX = "auto";
  const track = document.createElement("div");
  const slide = document.createElement("div");
  const target = document.createElement("img");
  slide.append(target);
  track.append(slide);
  viewport.append(track);
  outer.append(viewport);
  document.body.append(outer);
  layout(outer, { left: 0, right: 1000, top: 0, bottom: 400 }, { scrollWidth: 1000, clientWidth: 1000 });
  layout(
    viewport,
    { left: 0, right: 1000, top: 0, bottom: 400 },
    { scrollWidth: 6000, clientWidth: 1000, scrollHeight: 400, clientHeight: 400 },
  );
  return { outer, viewport, slide, target };
};

describe("revealInNestedScrollers", () => {
  it("scrolls the overflow container so an off-screen slide's start edge is flush", () => {
    const { outer, viewport, target } = build();
    layout(target, { left: 2000, right: 3000, top: 0, bottom: 400 });
    revealInNestedScrollers(target);
    expect(viewport.scrollLeft).toBe(2000);
    expect(outer.scrollLeft).toBe(0);
  });

  it("aligns the containing snap area, including scroll margin and padding", () => {
    const { viewport, slide, target } = build();
    viewport.style.scrollSnapType = "x mandatory";
    viewport.style.scrollPaddingLeft = "20px";
    slide.style.scrollSnapAlign = "start";
    slide.style.scrollMarginLeft = "10px";
    layout(slide, { left: 2000, right: 3000, top: 0, bottom: 400 });
    layout(target, { left: 2050, right: 2150, top: 100, bottom: 200 });

    revealInNestedScrollers(target);

    expect(viewport.scrollLeft).toBe(1970);
  });

  it("uses the client box as the visible scrollport", () => {
    const { viewport, target } = build();
    viewport.style.overflowY = "auto";
    layout(
      viewport,
      { left: 0, right: 120, top: 0, bottom: 120 },
      {
        scrollWidth: 500,
        clientWidth: 100,
        scrollHeight: 500,
        clientHeight: 100,
        clientLeft: 10,
        clientTop: 10,
      },
    );
    layout(target, { left: 114, right: 119, top: 114, bottom: 119 });

    revealInNestedScrollers(target);

    expect(viewport.scrollLeft).toBe(9);
    expect(viewport.scrollTop).toBe(9);
  });

  it("forces authored smooth scrollers to move instantly", () => {
    const { viewport, target } = build();
    viewport.style.scrollBehavior = "smooth";
    layout(target, { left: 2000, right: 3000, top: 0, bottom: 400 });
    const scrollTo = vi.spyOn(viewport, "scrollTo");

    revealInNestedScrollers(target);

    expect(scrollTo).toHaveBeenCalledWith({ left: 2000, top: 0, behavior: "instant" });
    expect(viewport.scrollLeft).toBe(2000);
  });

  it("scrolls back for a slide before the viewport and leaves a visible one alone", () => {
    const { viewport, target } = build();
    viewport.scrollLeft = 3000;
    layout(target, { left: -1000, right: 0, top: 0, bottom: 400 });
    revealInNestedScrollers(target);
    expect(viewport.scrollLeft).toBe(2000);

    layout(target, { left: 100, right: 900, top: 0, bottom: 400 });
    revealInNestedScrollers(target);
    expect(viewport.scrollLeft).toBe(2000);
  });

  it("never touches the document scroll", () => {
    const { target } = build();
    layout(target, { left: 2000, right: 3000, top: 5000, bottom: 5400 });
    const scrollTo = vi.spyOn(window, "scrollTo");
    revealInNestedScrollers(target);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
