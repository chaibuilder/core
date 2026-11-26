import * as blockHelpers from "~/builder/core/functions/block-helpers";
import { transformNode, type HimalayaNode } from "~/builder/hooks/use-blocks-html-for-ai";

describe("transformNode", () => {
  const mockBlocks: any[] = [];

  describe("Action hints", () => {
    const blocks: any[] = [
      { _id: "box1", _type: "Box", _canMove: false },
      { _id: "card1", _type: "ProductCard", _canDelete: false, title: "Hi" },
    ];

    test("core blocks carry resolved can-* hints", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "Box" },
          { key: "data-block-id", value: "box1" },
        ],
        children: [],
      };
      expect(transformNode(node, blocks).attributes).toContainEqual({ key: "can-move", value: "false" });
    });

    test("custom blocks carry hints but never the raw _can* props", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "ProductCard" },
          { key: "data-block-id", value: "card1" },
        ],
        children: [],
      };
      const keys = transformNode(node, blocks).attributes?.map((attr) => attr.key);
      expect(keys).toContain("can-delete");
      expect(keys).not.toContain("_can-delete");
    });
  });

  describe("Core Blocks", () => {
    test("should remove data-block-type attribute from core block", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "Box" },
          { key: "class", value: "container" },
        ],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.attributes?.find((attr) => attr.key === "data-block-type")).toBeUndefined();
      expect(result.attributes?.find((attr) => attr.key === "class")).toBeDefined();
      expect(result.tagName).toBe("div");
    });

    test("should remove data-block-id attribute from core block", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "button",
        attributes: [
          { key: "data-block-type", value: "Button" },
          { key: "data-block-id", value: "btn123" },
          { key: "class", value: "btn" },
        ],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.attributes?.find((attr) => attr.key === "data-block-id")).toBeUndefined();
      expect(result.attributes?.find((attr) => attr.key === "class")).toBeDefined();
    });

    test("should recursively transform children of core blocks", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "Box" }],
        children: [
          {
            type: "element",
            tagName: "h1",
            attributes: [{ key: "data-block-type", value: "Heading" }],
            children: [],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.children?.[0].attributes?.find((attr) => attr.key === "data-block-type")).toBeUndefined();
    });
  });

  describe("Custom Blocks", () => {
    test("should convert custom block to web component tag", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "CustomWidget" },
          { key: "data-block-id", value: "widget123" },
        ],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.tagName).toBe("chai-custom-widget");
    });

    test("should convert camelCase block type to kebab-case tag name", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "MyCustomComponent" }],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.tagName).toBe("chai-my-custom-component");
    });

    test("should keep only id and chai-type attributes for custom blocks", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "CustomBlock" },
          { key: "data-block-id", value: "custom123" },
          { key: "class", value: "some-class" },
          { key: "style", value: "color: red" },
        ],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.attributes).toHaveLength(2);
      expect(result.attributes).toContainEqual({
        key: "chai-type",
        value: "CustomBlock",
      });
      expect(result.attributes).toContainEqual({
        key: "bid",
        value: "custom123",
      });
    });

    test("should have only chai-type attribute if no data-block-id", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "CustomBlock" },
          { key: "class", value: "some-class" },
        ],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.attributes).toHaveLength(1);
      expect(result.attributes?.[0]).toEqual({
        key: "chai-type",
        value: "CustomBlock",
      });
    });

    // himalaya's stringify does `value.indexOf('"')` on every attribute value, so an
    // attribute serialized from an undefined prop crashes the whole page-html build.
    test("should skip props whose value is undefined", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "CustomBlock" },
          { key: "data-block-id", value: "custom123" },
        ],
        children: [],
      };

      const result = transformNode(node, [{ _id: "custom123", _type: "CustomBlock", filters: undefined, sortBy: "asc" }]);

      expect(result.attributes?.find((attr) => attr.key === "filters")).toBeUndefined();
      expect(result.attributes).toContainEqual({ key: "sort-by", value: "asc" });
      expect(result.attributes?.every((attr) => typeof attr.value === "string")).toBe(true);
    });

    test("should remove all children from custom blocks", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "CustomBlock" }],
        children: [
          {
            type: "element",
            tagName: "p",
            attributes: [],
            children: [{ type: "text", content: "Child content" }],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.children).toHaveLength(0);
    });
  });

  describe("Non-block Elements", () => {
    test("should recursively transform children of non-block elements", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "class", value: "wrapper" }],
        children: [
          {
            type: "element",
            tagName: "div",
            attributes: [{ key: "data-block-type", value: "Box" }],
            children: [],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.tagName).toBe("div");
      expect(result.attributes?.[0]).toEqual({
        key: "class",
        value: "wrapper",
      });
      expect(result.children?.[0].attributes?.find((attr) => attr.key === "data-block-type")).toBeUndefined();
    });

    test("should keep text nodes unchanged", () => {
      const node: HimalayaNode = {
        type: "text",
        content: "Hello World",
      };

      const result = transformNode(node, mockBlocks);

      expect(result).toEqual(node);
    });

    test("should handle nodes without attributes", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result).toEqual(node);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty children array", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "Box" }],
        children: [],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.children).toHaveLength(0);
    });

    test("should handle nested core blocks", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "Box" }],
        children: [
          {
            type: "element",
            tagName: "div",
            attributes: [{ key: "data-block-type", value: "Box" }],
            children: [
              {
                type: "element",
                tagName: "p",
                attributes: [{ key: "data-block-type", value: "Paragraph" }],
                children: [],
              },
            ],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.attributes?.find((attr) => attr.key === "data-block-type")).toBeUndefined();
      expect(result.children?.[0].attributes?.find((attr) => attr.key === "data-block-type")).toBeUndefined();
      expect(
        result.children?.[0].children?.[0].attributes?.find((attr) => attr.key === "data-block-type"),
      ).toBeUndefined();
    });

    test("should handle custom block inside core block", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [{ key: "data-block-type", value: "Box" }],
        children: [
          {
            type: "element",
            tagName: "div",
            attributes: [
              { key: "data-block-type", value: "CustomWidget" },
              { key: "data-block-id", value: "widget1" },
            ],
            children: [
              {
                type: "element",
                tagName: "p",
                attributes: [],
                children: [],
              },
            ],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      expect(result.tagName).toBe("div");
      expect(result.children?.[0].tagName).toBe("chai-custom-widget");
      expect(result.children?.[0].children).toHaveLength(0);
    });
  });

  describe("Nested Custom Blocks with canAcceptBlock", () => {
    let canAddChildBlockSpy: any;

    afterEach(() => {
      canAddChildBlockSpy?.mockRestore();
    });

    test("should recursively transform nested custom blocks when parent has canAcceptBlock", () => {
      canAddChildBlockSpy = vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation((parentType: string) => {
        return ["Accordion", "AccordionTrigger", "AccordionContent"].includes(parentType);
      });

      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "Accordion" },
          { key: "data-block-id", value: "accordion1" },
        ],
        children: [
          {
            type: "element",
            tagName: "div",
            attributes: [
              { key: "data-block-type", value: "AccordionTrigger" },
              { key: "data-block-id", value: "trigger1" },
            ],
            children: [
              {
                type: "element",
                tagName: "h3",
                attributes: [{ key: "data-block-type", value: "Heading" }],
                children: [],
              },
            ],
          },
          {
            type: "element",
            tagName: "div",
            attributes: [
              { key: "data-block-type", value: "AccordionContent" },
              { key: "data-block-id", value: "content1" },
            ],
            children: [
              {
                type: "element",
                tagName: "p",
                attributes: [{ key: "data-block-type", value: "Paragraph" }],
                children: [],
              },
            ],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      // Parent Accordion should be transformed to web component
      expect(result.tagName).toBe("chai-accordion");

      // Children should be preserved and transformed (AccordionTrigger and AccordionContent)
      expect(result.children).toHaveLength(2);

      // AccordionTrigger should be transformed
      expect(result.children?.[0].tagName).toBe("chai-accordion-trigger");

      // AccordionTrigger's children (Heading) should be preserved since it has canAcceptBlock
      expect(result.children?.[0].children).toHaveLength(1);
      expect(result.children?.[0].children?.[0].tagName).toBe("h3");

      // AccordionContent should be transformed
      expect(result.children?.[1].tagName).toBe("chai-accordion-content");

      // AccordionContent's children (Paragraph) should be preserved
      expect(result.children?.[1].children).toHaveLength(1);
      expect(result.children?.[1].children?.[0].tagName).toBe("p");
    });

    test("should remove children from nested custom block without canAcceptBlock", () => {
      canAddChildBlockSpy = vi.spyOn(blockHelpers, "canAddChildBlock").mockImplementation((parentType: string) => {
        // Only ParentCustomBlock can accept children, ChildCustomBlock cannot
        return parentType === "ParentCustomBlock";
      });

      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "ParentCustomBlock" },
          { key: "data-block-id", value: "parent1" },
        ],
        children: [
          {
            type: "element",
            tagName: "div",
            attributes: [
              { key: "data-block-type", value: "ChildCustomBlock" },
              { key: "data-block-id", value: "child1" },
            ],
            children: [
              {
                type: "element",
                tagName: "span",
                attributes: [],
                children: [{ type: "text", content: "Should be removed" }],
              },
            ],
          },
        ],
      };

      const result = transformNode(node, mockBlocks);

      // Parent should have children (since it has canAcceptBlock)
      expect(result.tagName).toBe("chai-parent-custom-block");
      expect(result.children).toHaveLength(1);

      // Child custom block should be transformed
      expect(result.children?.[0].tagName).toBe("chai-child-custom-block");

      // Child's children should be removed (since ChildCustomBlock doesn't have canAcceptBlock)
      expect(result.children?.[0].children).toHaveLength(0);
    });
  });

  describe("Icon blocks", () => {
    test("emits icon-name for Lucide SVGs and omits raw icon SVG", () => {
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "Icon" },
          { key: "data-block-id", value: "ico-lucide" },
        ],
        children: [],
      };
      const result = transformNode(node, [
        {
          _id: "ico-lucide",
          _type: "Icon",
          icon: '<svg class="lucide lucide-arrow-right"><path d="M5 12h14"/></svg>',
          width: "20",
          height: "20",
        },
      ]);

      expect(result.tagName).toBe("chai-icon");
      expect(result.attributes).toContainEqual({ key: "icon-name", value: "arrow-right" });
      expect(result.attributes?.find((a) => a.key === "icon")).toBeUndefined();
    });

    test("preserves raw icon SVG attribute when icon is non-Lucide", () => {
      const rawSvg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
      const node: HimalayaNode = {
        type: "element",
        tagName: "div",
        attributes: [
          { key: "data-block-type", value: "Icon" },
          { key: "data-block-id", value: "ico-custom" },
        ],
        children: [],
      };
      const result = transformNode(node, [
        {
          _id: "ico-custom",
          _type: "Icon",
          icon: rawSvg,
          width: "24",
          height: "24",
        },
      ]);

      expect(result.tagName).toBe("chai-icon");
      expect(result.attributes?.find((a) => a.key === "icon-name")).toBeUndefined();
      expect(result.attributes).toContainEqual({ key: "icon", value: rawSvg });
    });
  });
});
