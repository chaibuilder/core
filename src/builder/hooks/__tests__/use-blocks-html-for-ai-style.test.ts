import { canvasHtmlToAiHtml } from "~/builder/hooks/use-blocks-html-for-ai";
import { ChaiBlock } from "~/types/common";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";

// #4428: the builder AI panel dropped every <style>, so an edited section lost its style block.
describe("builder AI-HTML keeps style blocks (#4428)", () => {
  const css = '#faq summary>span{display:none!important}\n.x::before{content:"</style>  &lt; \\2603"}';
  const blocks: ChaiBlock[] = [
    { _id: "sec", _type: "Box", styles: "#styles:,flex" },
    { _id: "css", _type: "Box", _parent: "sec", tag: "style" },
    { _id: "rule", _type: "Text", _parent: "css", styles: "#styles:,text-black", content: css },
    { _id: "h", _type: "Heading", _parent: "sec", tag: "h2", styles: "#styles:,", content: "Title" },
  ];
  // Canvas DOM: block style wrapped in a Text span, plus a canvas-injected (block-less) <style>.
  const canvasHtml =
    `<div data-block-type="Box" data-block-id="sec" class="flex">` +
    `<style>.tw{color:red}</style><link rel="stylesheet" href="/f.css">` +
    `<style data-block-type="Box" data-block-id="css"><span data-block-type="Text" data-block-id="rule" class="text-black">${css}</span></style>` +
    `<h2 data-block-type="Heading" data-block-id="h">Title</h2></div>`;

  test("export keeps the block style (encoded) and drops canvas-injected CSS", () => {
    const html = canvasHtmlToAiHtml(canvasHtml, blocks);
    expect(html).toContain("bid='css'");
    expect(html).toContain("data-chai-style-encoding");
    expect(html).not.toContain(".tw{color:red}");
    expect(html).not.toContain("<span");
    expect(html).not.toContain("stylesheet");
  });

  test("builder export -> html-to-json keeps the style block and its CSS byte-exact", async () => {
    const imported = await getBlocksFromHTML(canvasHtmlToAiHtml(canvasHtml, blocks));
    expect(imported.find((b) => b.tag === "style")).toBeDefined();
    expect(imported.find((b) => b._type === "Text")?.content).toBe(css);
    expect(imported.find((b) => b._type === "Heading")?.content).toBe("Title");
  });
});
