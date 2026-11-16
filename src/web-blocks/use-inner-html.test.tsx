// @vitest-environment happy-dom
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Component as HeadingBlock } from "./heading";
import { Component as RichTextBlock } from "./rte";
import { useInnerHtml } from "./use-inner-html";

// React 19 re-applies an inline `dangerouslySetInnerHTML={{ __html }}` on every render
// (new object identity → innerHTML reassigned), replacing the element's child nodes even
// when the HTML is unchanged. In the builder canvas every block re-renders on selection,
// so the whole page's markup was re-injected per click. `useInnerHtml` memoizes the object
// on the string so React leaves the DOM alone until the HTML actually changes.
//
// `cache()` only memoizes under React's real react-server dispatcher; the plain "react"
// build resolved in tests is a passthrough (see the hook's doc comment). Fake a
// request-scoped cache so the cross-instance sharing `useInnerHtml` relies on for RSC
// flight de-duplication is actually exercised below.
// eslint-disable-next-line no-restricted-syntax
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const memo = new Map<unknown, Map<string, unknown>>();
  return {
    ...actual,
    cache:
      (fn: (arg: string) => unknown) =>
      (arg: string) => {
        let byArg = memo.get(fn);
        if (!byArg) {
          byArg = new Map();
          memo.set(fn, byArg);
        }
        if (!byArg.has(arg)) byArg.set(arg, fn(arg));
        return byArg.get(arg);
      },
  };
});

describe("useInnerHtml / block innerHTML stability", () => {
  const props = (content: string) => ({ blockProps: { "data-block-id": "x" }, styles: {}, content }) as any;

  it("HeadingBlock keeps its child nodes across re-renders with equal content", () => {
    const { container, rerender } = render(<HeadingBlock {...props("<b>Hi</b> there")} tag="h2" />);
    const h2 = container.querySelector("h2")!;
    const firstChild = h2.firstChild;
    rerender(<HeadingBlock {...props("<b>Hi</b> there")} tag="h2" />);
    rerender(<HeadingBlock {...props("<b>Hi</b> there")} tag="h2" />);
    expect(h2.firstChild).toBe(firstChild);
    rerender(<HeadingBlock {...props("<i>Changed</i>")} tag="h2" />);
    expect(h2.innerHTML).toBe("<i>Changed</i>");
  });

  it("RichTextBlock keeps its child nodes across re-renders with equal content", () => {
    const html = "<p>Un <strong>texte</strong></p>";
    const { container, rerender } = render(<RichTextBlock {...props(html)} />);
    const div = container.querySelector("div")!;
    const firstChild = div.firstChild;
    rerender(<RichTextBlock {...props(html)} />);
    expect(div.firstChild).toBe(firstChild);
  });

  it("returns a stable object for the same string and a new one when it changes", () => {
    const { result, rerender } = renderHook(({ html }: { html: string | null | undefined }) => useInnerHtml(html), {
      initialProps: { html: "a" as string | null | undefined },
    });
    const first = result.current;
    rerender({ html: "a" });
    expect(result.current).toBe(first);
    rerender({ html: "b" });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ __html: "b" });
    // null and undefined normalize to the same identity as "".
    rerender({ html: null });
    const empty = result.current;
    expect(empty).toEqual({ __html: "" });
    rerender({ html: undefined });
    expect(result.current).toBe(empty);
    rerender({ html: "" });
    expect(result.current).toBe(empty);
  });

  it("shares the same __html object across instances for equal HTML (request-scoped cache)", () => {
    const a = renderHook(() => useInnerHtml("<p>shared</p>"));
    const b = renderHook(() => useInnerHtml("<p>shared</p>"));
    expect(a.result.current).toBe(b.result.current);
  });

  it("does not share the object across instances for different HTML", () => {
    const a = renderHook(() => useInnerHtml("<p>one</p>"));
    const b = renderHook(() => useInnerHtml("<p>two</p>"));
    expect(a.result.current).not.toBe(b.result.current);
  });
});
