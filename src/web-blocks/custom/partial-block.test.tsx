// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartialBlock } from "./partial-block";

const renderPartial = (props: Record<string, any>) =>
  render(
    <PartialBlock {...({ partialBlockId: "partial-1", blockProps: { "data-block-id": "p-1" }, ...props } as any)}>
      <p>partial content</p>
    </PartialBlock>,
  ).container.firstElementChild as HTMLElement;

describe("PartialBlock", () => {
  it("renders a bare span when no wrapper tag is set", () => {
    const el = renderPartial({ wrapperTag: "none", styles: { className: "py-6" } });
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("");
  });

  it("wraps the partial in the chosen tag with its styles on the live site", () => {
    const el = renderPartial({ wrapperTag: "section", styles: { className: "bg-muted py-6", style: "color:red" } });
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toBe("bg-muted py-6");
    expect(el.getAttribute("data-block-id")).toBe("p-1");
    expect(el.hasAttribute("data-partial-wrapper")).toBe(false);
    expect(el.textContent).toBe("partial content");
  });

  it("marks the wrapper for the builder canvas", () => {
    const el = renderPartial({ inBuilder: true, wrapperTag: "header", styles: { className: "sticky" } });
    expect(el.tagName).toBe("HEADER");
    expect(el.getAttribute("data-partial-wrapper")).toBe("header");
  });

  it("ignores a wrapper tag outside the allowed list", () => {
    expect(renderPartial({ wrapperTag: "script" }).tagName).toBe("SPAN");
  });

  it("drops the wrapper on the live site when the merge left nothing to wrap", () => {
    const props = { partialBlockId: "missing", blockProps: {}, wrapperTag: "section", styles: { className: "py-6" } };
    const el = render(<PartialBlock {...(props as any)} />).container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("");
  });
});
