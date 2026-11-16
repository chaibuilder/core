// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server.browser";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import * as Box from "~/web-blocks/box";
import * as Text from "~/web-blocks/text";
import { RenderBlocks } from "./blocks-renderer";
import { RenderOnOpen } from "./render-on-open";

// next/dynamic cannot SSR outside Next; the wrapper adds nothing under test.
// eslint-disable-next-line no-restricted-syntax
vi.mock("./render-on-open.lazy", async () => ({
  RenderOnOpen: (await import("./render-on-open")).RenderOnOpen,
}));

afterEach(() => cleanup());

const LINK = 'href="tel:+15550100"';
const content = <a href="tel:+15550100">Appeler</a>;

const drawer = (
  <div>
    <input className="peer hidden" id="menu-toggle" type="checkbox" />
    <label htmlFor="menu-toggle">Menu</label>
    <div className="scale-y-0 peer-checked:scale-y-100">
      <RenderOnOpen>{content}</RenderOnOpen>
    </div>
  </div>
);

describe("RenderOnOpen", () => {
  it("server-renders only an inert marker", () => {
    const html = renderToString(drawer);
    expect(html).toContain('<div class="scale-y-0 peer-checked:scale-y-100"><template></template></div>');
    expect(html).not.toContain(LINK);
  });

  it("renders on the peer checkbox and keeps the content once closed", async () => {
    const { container } = render(drawer);
    expect(container.querySelector("template")).not.toBeNull();
    const toggle = container.querySelector("input")!;

    act(() => toggle.click());
    await waitFor(() => expect(container.innerHTML).toContain(LINK));
    expect(container.querySelector("template")).toBeNull();

    act(() => toggle.click());
    expect(toggle.checked).toBe(false);
    expect(container.innerHTML).toContain(LINK);
  });

  it("renders a <details> body on toggle", async () => {
    const { container } = render(
      <details className="group">
        <summary>Heures</summary>
        <div className="opacity-0 group-open:opacity-100">
          <RenderOnOpen>{content}</RenderOnOpen>
        </div>
      </details>,
    );
    const details = container.querySelector("details")!;

    act(() => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    await waitFor(() => expect(container.innerHTML).toContain(LINK));
  });

  it("renders straight away when nothing can open the panel", async () => {
    const { container } = render(
      <div>
        <RenderOnOpen>{content}</RenderOnOpen>
      </div>,
    );
    await waitFor(() => expect(container.innerHTML).toContain(LINK));
  });
});

// Same streaming helper as repeater-empty-state.test.tsx: RenderBlock is an
// async server component, so stream to HTML and mount the markup.
const mountStream = async (element: React.ReactElement) => {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  document.body.innerHTML = await new Response(stream as any).text();
};

registerChaiBlock(Box.Component as any, Box.Config as any);
registerChaiBlock(Text.Component as any, Text.Config as any);

const panel = (attrs?: Record<string, string>): ChaiBlock[] => [
  { _id: "box", _type: "Box", tag: "div", ...(attrs ? { styles_attrs: attrs } : {}) } as ChaiBlock,
  { _id: "rule", _type: "Text", _parent: "box", content: "Appeler" } as ChaiBlock,
];

const renderBlocks = (blocks: ChaiBlock[]) =>
  mountStream(
    <RenderBlocks {...({ blocks, lang: "en", fallbackLang: "en", draft: false, externalData: {} } as any)} />,
  );

describe("renderer opt-in", () => {
  it('defers only the children of a block with data-render="on-open"', async () => {
    await renderBlocks(panel({ "data-render": "on-open" }));
    expect(document.body.querySelector("template")).not.toBeNull();
    expect(screen.queryByText("Appeler")).toBeNull();
  });

  it("renders every other block's children in the HTML", async () => {
    await renderBlocks(panel());
    expect(document.body.querySelector("template")).toBeNull();
    expect(screen.getByText("Appeler")).toBeTruthy();
  });
});
