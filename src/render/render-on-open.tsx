"use client";

import { startTransition, Suspense, useEffect, useRef, useState, type ReactNode } from "react";

type Trigger = HTMLInputElement | HTMLDetailsElement;

// The checkbox `peer-checked:` reacts to (a previous sibling with the `peer`
// class), else the panel's <details>.
const findTrigger = (panel: Element): Trigger | null => {
  for (let el = panel.previousElementSibling; el; el = el.previousElementSibling)
    if (el.matches("input[type=checkbox].peer")) return el as HTMLInputElement;
  return panel.closest("details");
};

const isOpen = (trigger: Trigger) => (trigger instanceof HTMLInputElement ? trigger.checked : trigger.open);

/**
 * Holds a closed panel's content (a peer-checkbox drawer or a <details> body)
 * until the panel first opens. The server and the first client render emit
 * only an inert <template>, so the closed content costs no HTML, DOM nodes or
 * hydration; it stays in the RSC payload and renders from there on open. Once
 * rendered it stays rendered: closing is left to the panel's CSS.
 *
 * Opted in per block with `styles_attrs["data-render"] === "on-open"` (see
 * block-renderer.tsx). Twin of the host's components/RenderOnOpen.tsx.
 */
export function RenderOnOpen({ children }: { children: ReactNode }) {
  const markerRef = useRef<HTMLTemplateElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const panel = markerRef.current?.parentElement;
    if (open || !panel) return;
    // change and toggle are discrete events, whose updates React renders in
    // full before the next paint; a transition lets the CSS open paint first
    // and renders the content in yielding slices.
    const render = () => startTransition(() => setOpen(true));
    const trigger = findTrigger(panel);
    // Nothing can open it: render rather than hide authored content for good.
    if (!trigger) {
      render();
      return;
    }
    const sync = () => {
      if (isOpen(trigger)) render();
    };
    // Covers a tap before hydration and form state the browser restored.
    sync();
    const type = trigger instanceof HTMLInputElement ? "change" : "toggle";
    trigger.addEventListener(type, sync);
    window.addEventListener("pageshow", sync);
    return () => {
      trigger.removeEventListener(type, sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [open]);

  if (!open) return <template ref={markerRef} />;
  // SSR next/dynamic components have no boundary of their own; this one lets
  // the open commit while their chunks load, without touching outer boundaries.
  return <Suspense fallback={null}>{children}</Suspense>;
}
