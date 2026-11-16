// @vitest-environment happy-dom
import { renderToReadableStream } from "react-dom/server.browser";
import { describe, expect, it } from "vitest";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import * as Box from "~/web-blocks/box";
import * as Text from "~/web-blocks/text";
import { RenderBlocks } from "./blocks-renderer";

registerChaiBlock(Box.Component as any, Box.Config as any);
registerChaiBlock(Text.Component as any, Text.Config as any);

describe("RenderBlocks", () => {
  it('renders a style Box with its CSS as text, not "[object Object]"', async () => {
    // What HTML import makes of <style>.faq{color:red}</style>.
    const blocks = [
      { _id: "css", _type: "Box", tag: "style" },
      { _id: "rule", _type: "Text", _parent: "css", content: ".faq{color:red}" },
    ] as ChaiBlock[];

    const stream = await renderToReadableStream(
      <RenderBlocks {...({ blocks, lang: "fr", fallbackLang: "fr", draft: false, externalData: {} } as any)} />,
    );
    await stream.allReady;
    const html = await new Response(stream as any).text();

    expect(html).toMatch(/<style[^>]*>\.faq\{color:red\}<\/style>/);
  });
});
