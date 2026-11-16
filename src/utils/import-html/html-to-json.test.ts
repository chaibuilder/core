import * as blockHelpers from "~/builder/core/functions/block-helpers";
import { getBlocksFromHTML, getSanitizedHTML } from "~/utils/import-html/html-to-json";

describe("getSanitizedHTML", () => {
  test("should remove $name attributes", () => {
    const input = '<div $name="test" data-chai-name="test">Content</div>';
    const expected = '<div data-chai-name="test">Content</div>';
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should remove escaped quotes and backslashes from attributes", () => {
    const input = '<div class=\\"test\\" data-value=\\"123\\">Content</div>';
    const expected = '<div class="test" data-value="123">Content</div>';
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should remove escaped newlines and whitespace characters", () => {
    const input = "Line 1\\nLine 2\\n<div>\\n  Content\\n</div>";
    const expected = "Line 1Line 2<div> Content</div>";
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should remove script tags and their content", () => {
    const input = '<div>Before<script>alert("test");</script>After</div>';
    const expected = "<div>BeforeAfter</div>";
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should convert body tags to div tags", () => {
    const input = '<body class="body-class">Content</body>';
    const expected = "Content";
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should remove excessive whitespace between tags", () => {
    const input = "<div>  <span>  Content  </span>  </div>";
    const expected = "<div><span> Content </span></div>";
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should handle multiple attributes with escaped values", () => {
    const input = '<div class=\\"c1\\" id=\\"id1\\" data-value=\\"test\\">Content</div>';
    const expected = '<div class="c1" id="id1" data-value="test">Content</div>';
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should handle empty input", () => {
    expect(getSanitizedHTML("")).toBe("");
  });

  test("should preserve valid HTML structure", () => {
    const input = `
      <div class="container">
        <h1>Title</h1>
        <p>Paragraph</p>
      </div>
    `;
    const expected = '<div class="container"><h1>Title</h1><p>Paragraph</p></div>';
    expect(getSanitizedHTML(input)).toBe(expected);
  });

  test("should handle HTML with escaped special characters", () => {
    const input = '<div data-special=\\"<>/?\\">Content</div>';
    const expected = '<div data-special="<>/?">Content</div>';
    expect(getSanitizedHTML(input)).toBe(expected);
  });
});

describe("getBlocksFromHTML - RichText handling", () => {
  test("should preserve paragraph wrapper for direct p rich-text blocks", async () => {
    const html = "<p>Paragraph content</p>";
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Paragraph");
    expect(blocks[0].content).toBe("<p>Paragraph content</p>");
  });

  test("should detect div with 'rte' class as RichText block", async () => {
    const html = '<div class="rte"><p>Rich text content</p><strong>Bold text</strong></div>';
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Paragraph");
    expect(blocks[0].content).toContain("<p>Rich text content</p>");
    expect(blocks[0].content).toContain("<strong>Bold text</strong>");
  });

  test("should detect div with 'rte' class among other classes as Paragraph block", async () => {
    const html = '<div class="container rte text-lg"><p>Content</p></div>';
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Paragraph");
  });

  test("should detect element with data-chai-richtext attribute as Paragraph block", async () => {
    const html = "<div data-chai-richtext><p>Rich text content</p></div>";
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Paragraph");
  });

  test("should not treat regular div without rte class as Paragraph", async () => {
    const html = '<div class="container"><p>Regular content</p></div>';
    const blocks = await getBlocksFromHTML(html);

    expect(blocks[0]._type).toBe("Box");
  });
});

describe("getBlocksFromHTML - Custom blocks with canAcceptBlock", () => {
  let canAddChildBlockSpy: any;

  afterEach(() => {
    canAddChildBlockSpy?.mockRestore();
  });

  test("should import children for custom blocks with canAcceptBlock", async () => {
    canAddChildBlockSpy = vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation((parentType: string) => {
      return ["Accordion", "AccordionTrigger", "AccordionContent"].includes(parentType);
    });

    const html = `
      <chai-accordion chai-type="Accordion" bid="acc1">
        <chai-accordion-trigger chai-type="AccordionTrigger" bid="trigger1">
          <h3 class="text-lg">Trigger Text</h3>
        </chai-accordion-trigger>
        <chai-accordion-content chai-type="AccordionContent" bid="content1">
          <p class="text-sm">Content Text</p>
        </chai-accordion-content>
      </chai-accordion>
    `;
    const blocks = await getBlocksFromHTML(html);

    // Should have Accordion, AccordionTrigger, Heading, AccordionContent, Paragraph
    expect(blocks.length).toBeGreaterThanOrEqual(5);

    const accordion = blocks.find((b) => b._type === "Accordion");
    const trigger = blocks.find((b) => b._type === "AccordionTrigger");
    const content = blocks.find((b) => b._type === "AccordionContent");
    const heading = blocks.find((b) => b._type === "Heading");
    const paragraph = blocks.find((b) => b._type === "Paragraph");

    expect(accordion).toBeDefined();
    expect(trigger).toBeDefined();
    expect(content).toBeDefined();
    expect(heading).toBeDefined();
    expect(paragraph).toBeDefined();

    // Check parent relationships
    expect(trigger?._parent).toBe(accordion?._id);
    expect(content?._parent).toBe(accordion?._id);
    expect(heading?._parent).toBe(trigger?._id);
    expect(paragraph?._parent).toBe(content?._id);
  });

  test("should not import children for custom blocks without canAcceptBlock", async () => {
    canAddChildBlockSpy = vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation(() => false);

    const html = `
      <chai-custom-widget chai-type="CustomWidget" bid="widget1">
        <div class="inner">
          <p>This should not be imported</p>
        </div>
      </chai-custom-widget>
    `;
    const blocks = await getBlocksFromHTML(html);

    // Should only have the CustomWidget block, no children
    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("CustomWidget");
  });

  test("should handle nested custom blocks where parent accepts children but child does not", async () => {
    canAddChildBlockSpy = vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation((parentType: string) => {
      // Only ParentBlock can accept children
      return parentType === "ParentBlock";
    });

    const html = `
      <chai-parent-block chai-type="ParentBlock" bid="parent1">
        <chai-child-block chai-type="ChildBlock" bid="child1">
          <p>This should not be imported</p>
        </chai-child-block>
      </chai-parent-block>
    `;
    const blocks = await getBlocksFromHTML(html);

    // Should have ParentBlock and ChildBlock, but not the paragraph inside ChildBlock
    expect(blocks).toHaveLength(2);

    const parent = blocks.find((b) => b._type === "ParentBlock");
    const child = blocks.find((b) => b._type === "ChildBlock");

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child?._parent).toBe(parent?._id);

    // No paragraph should exist
    const paragraph = blocks.find((b) => b._type === "Paragraph");
    expect(paragraph).toBeUndefined();
  });
});

describe("getBlocksFromHTML - Partial block import (AI-emitted)", () => {
  test("should derive type without Chai prefix when chai-type is absent", async () => {
    // AI emits <chai-partial-block partial-id="ID"> per the system prompt —
    // no chai-type attribute. Type must resolve to registered "PartialBlock".
    const html = `<chai-partial-block partial-id="abc-123"></chai-partial-block>`;
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("PartialBlock");
    expect(blocks[0].partialBlockId).toBe("abc-123");
  });

  test("should still honor explicit chai-type and kebab partial-block-id (round-trip export)", async () => {
    const html = `<chai-partial-block chai-type="PartialBlock" partial-block-id="abc-123" bid="pb1"></chai-partial-block>`;
    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("PartialBlock");
    expect(blocks[0].partialBlockId).toBe("abc-123");
    expect(blocks[0]._bid).toBe("pb1");
  });

  test("should derive Repeater type from chai-repeater tag without chai-type", async () => {
    const html = `<chai-repeater repeater-items="{{page.products}}"></chai-repeater>`;
    const blocks = await getBlocksFromHTML(html);

    expect(blocks[0]._type).toBe("Repeater");
    expect(blocks[0].repeaterItems).toBe("{{page.products}}");
  });
});

describe("getBlocksFromHTML - Icon name resolution", () => {
  const iconOf = async (iconName: string) => {
    const html = `<chai-icon chai-type="Icon" icon-name="${iconName}" width="16" height="16"></chai-icon>`;
    const blocks = await getBlocksFromHTML(html);
    return blocks.find((b) => b._type === "Icon");
  };

  test("resolves a direct lucide icon name to an inline SVG", async () => {
    const icon = await iconOf("house");
    expect(icon).toBeDefined();
    expect(icon?._iconName).toBeUndefined();
    expect(icon?.icon).toContain("<svg");
    expect(icon?.icon).toContain("lucide-house");
  });

  test("resolves an aliased name (home -> house) to the canonical icon", async () => {
    const icon = await iconOf("home");
    expect(icon?.icon).toContain("lucide-house");
    // canonical class, not the alias the AI emitted
    expect(icon?.icon).not.toContain("lucide-home");
  });

  test("resolves check-circle alias to circle-check-big", async () => {
    const icon = await iconOf("check-circle");
    expect(icon?.icon).toContain("lucide-circle-check-big");
  });

  test("normalizes casing and separators (ArrowRight, arrow_right)", async () => {
    const a = await iconOf("ArrowRight");
    const b = await iconOf("arrow_right");
    expect(a?.icon).toContain("lucide-arrow-right");
    expect(b?.icon).toContain("lucide-arrow-right");
  });

  test("normalizes prefixed/suffixed class-style tokens (lucide-search, search-icon)", async () => {
    const a = await iconOf("lucide-search");
    const b = await iconOf("search-icon");
    expect(a?.icon).toContain("lucide-search");
    expect(b?.icon).toContain("lucide-search");
  });

  test("normalizes lucide-react component names (AlertCircleIcon, HouseIcon)", async () => {
    // PascalCase + trailing `Icon` — kebabCase must run before the -icon strip.
    const alert = await iconOf("AlertCircleIcon");
    expect(alert?.icon).toContain("lucide-circle-alert"); // alert-circle is itself an alias
    const house = await iconOf("HouseIcon");
    expect(house?.icon).toContain("lucide-house");
  });

  test("leaves the marker cleared and no resolved SVG for an unknown name", async () => {
    const icon = await iconOf("definitely-not-a-real-icon-xyz");
    expect(icon?._iconName).toBeUndefined();
    expect(icon?.icon ?? "").not.toContain("lucide-definitely-not-a-real-icon-xyz");
  });

  test("two different names produce two different icon bodies", async () => {
    const search = await iconOf("search");
    const rocket = await iconOf("rocket");
    expect(search?.icon).toBeDefined();
    expect(rocket?.icon).toBeDefined();
    expect(search?.icon).not.toBe(rocket?.icon);
  });
});

describe("getBlocksFromHTML - input value attribute", () => {
  test("drops an empty value attribute on inputs (would otherwise make the field controlled)", async () => {
    const blocks = await getBlocksFromHTML('<input type="email" name="email" value="" />');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Input");
    expect(blocks[0].styles_attrs?.value).toBeUndefined();
    expect(blocks[0].defaultValue).toBeUndefined();
  });

  test("maps a non-empty value onto the block's defaultValue, not a raw element attribute", async () => {
    const blocks = await getBlocksFromHTML('<input type="email" name="email" value="seed@x.com" />');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].defaultValue).toBe("seed@x.com");
    expect(blocks[0].styles_attrs?.value).toBeUndefined();
  });

  test("drops an empty value attribute on textareas too", async () => {
    const blocks = await getBlocksFromHTML('<textarea name="message" value=""></textarea>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].styles_attrs?.value).toBeUndefined();
    expect(blocks[0].defaultValue).toBeUndefined();
  });
});

describe("getBlocksFromHTML — links", () => {
  test("an anchor becomes a Link block carrying its href and target", async () => {
    const [block] = await getBlocksFromHTML('<a href="/about" target="_blank">About</a>');
    expect(block._type).toBe("Link");
    expect(block.link).toEqual({ href: "/about", target: "_blank" });
  });

  test("a pageType: href is tagged as a page reference", async () => {
    const ref = "pageType:page:11111111-1111-4111-8111-111111111111";
    const [block] = await getBlocksFromHTML(`<a href="${ref}">About</a>`);
    expect(block.link).toEqual({ href: ref, type: "pageType" });

  });
});

describe("getBlocksFromHTML - style element", () => {
  test("strips AI-HTML span wrappers from the CSS", async () => {
    const html =
      "<style bid='css'><span class='text-black' bid='t1'><span data-block-id='t0'>.a>b{color:red}</span></span></style>";

    const text = (await getBlocksFromHTML(html)).find((b) => b._type === "Text");

    expect(text?.content).toBe(".a>b{color:red}");
  });

  test("keeps plain CSS as is", async () => {
    const css = '.a>b{content:"a  b";color:red}\n.x{content:"\\2603"}';
    const text = (await getBlocksFromHTML(`<style>${css}</style>`)).find((b) => b._type === "Text");

    expect(text?.content).toBe(css);
  });
});

// FormButton renders its `label` prop only; its text used to land in a Text
// child that never shows, leaving the default label ("Submit") on the page.
describe("getBlocksFromHTML — form buttons", () => {
  it("takes a submit button's text as its label, with no child block", async () => {
    const blocks = await getBlocksFromHTML(
      '<form><input type="email" placeholder="Courriel"><button type="submit">Soumettre</button></form>',
    );
    const button = blocks.find((b) => b._type === "FormButton")!;
    expect(button.label).toBe("Soumettre");
    expect(blocks.filter((b) => b._parent === button._id)).toEqual([]);
  });

  it("takes a submit input's value as its label", async () => {
    const blocks = await getBlocksFromHTML('<form><input type="submit" value="Envoyer"></form>');
    expect(blocks.find((b) => b._type === "FormButton")!.label).toBe("Envoyer");
  });
});
