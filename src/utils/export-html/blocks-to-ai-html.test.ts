import { beforeEach, describe, expect, test, vi } from "vitest";
import { stringify } from "himalaya";
import * as blockHelpers from "~/builder/core/functions/block-helpers";
import { transformNode, type HimalayaNode } from "~/builder/hooks/use-blocks-html-for-ai";
import { ChaiBlock } from "~/types/common";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";
import { extractBlockHtmlSlices } from "~/utils/export-html/extract-block-html-slices";
import { blocksToAiHtml } from "./blocks-to-ai-html";

describe("blocksToAiHtml", () => {
  test("emits semantic HTML with bid + class for core blocks", () => {
    const blocks: ChaiBlock[] = [
      { _id: "a", _type: "Heading", tag: "h2", styles: "#styles:,text-3xl font-bold", content: "Hello" },
    ];
    // himalaya stringifies attributes with single quotes — the same format the
    // builder's use-blocks-html-for-ai produces and getBlocksFromHTML parses.
    const html = blocksToAiHtml(blocks);
    expect(html).toContain("<h2");
    expect(html).toContain("bid='a'");
    expect(html).toContain("class='text-3xl font-bold'");
    expect(html).toContain(">Hello</h2>");
  });

  test("emits resolved can-* hints instead of the raw instance flags", () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:,", _canMove: false, _canDelete: true },
      { _id: "img", _type: "Image", image: "a.png", _canDuplicate: false },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toMatch(/<div[^>]*can-move='false'/);
    expect(html).toMatch(/<chai-image[^>]*can-duplicate='false'/);
    expect(html).not.toContain("can-delete");
    expect(html).not.toContain("_can-");
  });

  test("nests children via _parent", () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:,flex" },
      { _id: "h", _type: "Heading", _parent: "box", tag: "h1", styles: "#styles:,", content: "Title" },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toMatch(/<div[^>]*bid='box'[^>]*>\s*<h1[^>]*bid='h'[^>]*>Title<\/h1>\s*<\/div>/);
  });

  test("renders Link href/target as an anchor", () => {
    const blocks: ChaiBlock[] = [
      {
        _id: "l",
        _type: "Link",
        styles: "#styles:,underline",
        link: { href: "/about", target: "_blank" },
        content: "About",
      },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toContain("<a ");
    expect(html).toContain("href='/about'");
    expect(html).toContain("target='_blank'");
    expect(html).toContain(">About</a>");
  });

  test("a pageType: page reference survives export → import", async () => {
    const ref = "pageType:blog-post:11111111-1111-4111-8111-111111111111";
    const blocks: ChaiBlock[] = [
      { _id: "l", _type: "Link", styles: "#styles:,underline", link: { type: "pageType", href: ref }, content: "Post" },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toContain(`href='${ref}'`);

    const [imported] = await getBlocksFromHTML(html);
    expect(imported.link).toMatchObject({ type: "pageType", href: ref });
  });

  test("Image (not a core block) becomes <chai-image> with image prop", () => {
    const blocks: ChaiBlock[] = [
      { _id: "img", _type: "Image", styles: "#styles:,", image: "https://x.test/a.png", alt: "pic" },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toContain("<chai-image");
    expect(html).toContain("chai-type='Image'");
    expect(html).toContain("image='https://x.test/a.png'");
  });

  test("custom blocks become <chai-{kebab}> with chai-type + kebab props", () => {
    const blocks: ChaiBlock[] = [
      { _id: "c", _type: "ProductCard", styles: "#styles:,", productId: "p1", mobileImage: "m.png" },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toContain("<chai-product-card");
    expect(html).toContain("chai-type='ProductCard'");
    expect(html).toContain("product-id='p1'");
    expect(html).toContain("mobile-image='m.png'");
    expect(html).toContain("bid='c'");
  });

  test("custom blocks emit every styles prop, its _attrs companion, and non-'content' content props", () => {
    const blocks: ChaiBlock[] = [
      {
        _id: "c",
        _type: "FancyCard",
        // multiple styles props, each a #styles: value
        styles: "#styles:,rounded-xl",
        iconStyles: "#styles:,h-6 w-6",
        // a styles_attrs companion object (serialized as JSON)
        styles_attrs: { "data-testid": "card" },
        // content lives under an arbitrary key, not `content`
        heading: "<p>Rich body</p>",
      },
    ];
    const html = blocksToAiHtml(blocks);
    // both style props survive (normalized #styles:, -> #styles:)
    expect(html).toContain("styles='#styles:rounded-xl'");
    expect(html).toContain("icon-styles='#styles:h-6 w-6'");
    // the _attrs companion is serialized, not dropped
    expect(html).toContain("styles-attrs='");
    expect(html).toContain("data-testid");
    // arbitrary content prop is emitted, not silently swallowed
    expect(html).toContain("heading='");
    expect(html).toContain("Rich body");
  });

  test("Text blocks emit a <span> carrying bid (sliceable), matching the in-builder wrapper", () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:," },
      { _id: "t", _type: "Text", _parent: "box", styles: "#styles:,text-black", content: "Just text" },
    ];
    const html = blocksToAiHtml(blocks);
    expect(html).toContain("<span");
    expect(html).toContain("bid='t'");
    expect(html).toContain(">Just text</span>");
    // read_block_html can now locate the Text block by its bid
    const slices = extractBlockHtmlSlices(html, ["t"]);
    expect(slices.t).toContain("bid='t'");
    expect(slices.t).toContain("Just text");
  });

  test("rootIds restricts output to the given subtrees", () => {
    const blocks: ChaiBlock[] = [
      { _id: "a", _type: "Heading", tag: "h1", styles: "#styles:,", content: "A" },
      { _id: "b", _type: "Paragraph", styles: "#styles:,", content: "B" },
    ];
    const html = blocksToAiHtml(blocks, ["b"]);
    expect(html).not.toContain("bid='a'");
    expect(html).toContain("bid='b'");
  });
});

describe("blocksToAiHtml round-trip via getBlocksFromHTML", () => {
  beforeEach(() => {
    // Container types accept children so nesting survives the round-trip.
    vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation((parentType?: string) => parentType === "Box");
  });

  test("core block tree survives blocks -> html -> blocks", async () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:,grid gap-4" },
      { _id: "h", _type: "Heading", _parent: "box", tag: "h2", styles: "#styles:,text-2xl", content: "Section" },
      { _id: "p", _type: "Paragraph", _parent: "box", styles: "#styles:,", content: "<p>Body text</p>" },
    ];

    const html = blocksToAiHtml(blocks);
    const reimported = await getBlocksFromHTML(html);

    const types = reimported.map((b) => b._type);
    expect(types).toContain("Box");
    expect(types).toContain("Heading");
    // The Box root carries its class through the round-trip.
    const box = reimported.find((b) => b._type === "Box");
    expect(box?.styles).toContain("grid gap-4");
    // Heading text is preserved.
    const heading = reimported.find((b) => b._type === "Heading");
    expect(heading?.content).toBe("Section");
  });

  test("style block CSS survives blocks -> html -> blocks", async () => {
    const css = '#faq summary>span:nth-of-type(2){display:none!important}\n.x::before{content:"</style>  &lt; \\2603"}';
    const blocks: ChaiBlock[] = [
      { _id: "css", _type: "Box", tag: "style" },
      { _id: "rule", _type: "Text", _parent: "css", content: css },
    ];

    const html = blocksToAiHtml(blocks);
    expect(html).not.toContain("<span");
    expect(html).toContain('content:"&lt;/style>  &amp;lt; \\2603"');

    const imported = await getBlocksFromHTML(html);
    const text = imported.find((b) => b._type === "Text");
    expect(text?.content).toBe(css);
    expect(imported.find((b) => b.tag === "style")?.styles_attrs?.["data-chai-style-encoding"]).toBeUndefined();
  });

  test("style CSS survives a quoted > in a style attribute", async () => {
    const css = '.x::before { content: "a  b"; }\n.x { color: red; }';
    const blocks: ChaiBlock[] = [
      { _id: "css", _type: "Box", tag: "style", styles_attrs: { media: "screen and (width > 600px)" } },
      { _id: "rule", _type: "Text", _parent: "css", content: css },
    ];

    const imported = await getBlocksFromHTML(blocksToAiHtml(blocks));
    expect(imported.find((b) => b._type === "Text")?.content).toBe(css);
  });

  test("an existing style attribute cannot shadow the transport marker", async () => {
    const css = '.x::before { content: "</style>  &lt;"; }';
    const blocks: ChaiBlock[] = [
      { _id: "css", _type: "Box", tag: "style", styles_attrs: { "data-chai-style-encoding": "legacy" } },
      { _id: "rule", _type: "Text", _parent: "css", content: css },
    ];

    const html = blocksToAiHtml(blocks);
    expect(html.match(/data-chai-style-encoding=/g)).toHaveLength(1);
    const imported = await getBlocksFromHTML(html);
    expect(imported.find((b) => b._type === "Text")?.content).toBe(css);
  });

  test("server serializer conforms to builder transformNode AI-HTML", async () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:,grid gap-4" },
      {
        _id: "card",
        _type: "ProductCard",
        _parent: "box",
        styles: "#styles:,rounded-xl",
        productId: "product-1",
        mobileImage: "mobile.webp",
      },
    ];
    const renderedNode: HimalayaNode = {
      type: "element",
      tagName: "div",
      attributes: [
        { key: "data-block-type", value: "Box" },
        { key: "data-block-id", value: "box" },
        { key: "class", value: "grid gap-4" },
      ],
      children: [
        {
          type: "element",
          tagName: "div",
          attributes: [
            { key: "data-block-type", value: "ProductCard" },
            { key: "data-block-id", value: "card" },
          ],
          children: [],
        },
      ],
    };

    const serverHtml = blocksToAiHtml(blocks);
    const builderHtml = stringify([transformNode(renderedNode, blocks)]).replace(/#styles:,/g, "#styles:");

    for (const html of [serverHtml, builderHtml]) {
      expect(html).toContain("bid='box'");
      expect(html).toContain("bid='card'");
      expect(html).toContain("chai-type='ProductCard'");
      expect(html).toContain("product-id='product-1'");
      expect(html).toContain("mobile-image='mobile.webp'");
      expect(html).toContain("styles='#styles:rounded-xl'");
    }

    const normalize = (roundTripped: ChaiBlock[]) =>
      roundTripped.map((block) => ({
        type: block._type,
        bid: (block as ChaiBlock & { _bid?: string })._bid,
        parentType: roundTripped.find((candidate) => candidate._id === block._parent)?._type,
        styles: block.styles,
        productId: block.productId,
        mobileImage: block.mobileImage,
      }));
    expect(normalize(await getBlocksFromHTML(serverHtml))).toEqual(normalize(await getBlocksFromHTML(builderHtml)));
  });

  test("Icon with a Lucide SVG exports icon-name and drops the raw svg", () => {
    const svg = "<svg class='lucide lucide-arrow-right'><path d='M0 0'/></svg>";
    const html = blocksToAiHtml([{ _id: "i", _type: "Icon", icon: svg }]);

    expect(html).toContain("icon-name='arrow-right'");
    expect(html).not.toContain("<path");
  });

  test("Icon whose SVG has no lucide-* token keeps the raw icon prop", () => {
    // Without a derivable name, dropping `icon` too would leave the element
    // carrying neither — the icon would be lost on a read -> edit round-trip.
    const svg = "<svg viewBox='0 0 24 24'><path d='M1 1'/></svg>";
    const html = blocksToAiHtml([{ _id: "i", _type: "Icon", icon: svg }]);

    expect(html).not.toContain("icon-name=");
    expect(html).toContain("viewBox");
  });

  test("extractBlockHtmlSlices can slice a converted page by bid", () => {
    const blocks: ChaiBlock[] = [
      { _id: "box", _type: "Box", styles: "#styles:," },
      { _id: "h", _type: "Heading", _parent: "box", tag: "h1", styles: "#styles:,", content: "Hi" },
    ];
    const html = blocksToAiHtml(blocks);
    const slices = extractBlockHtmlSlices(html, ["h"]);
    expect(slices.h).toContain("bid='h'");
    expect(slices.h).toContain("Hi");
  });
});
