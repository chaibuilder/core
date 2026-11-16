import { pickOnlyAIProps } from "~/builder/hooks/use-ask-ai";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { ChaiBlock } from "~/types/common";

// Real registry entries, one type per aiProps configuration. "UnknownBlock" is never registered.
registerTestBlocks(
  { type: "NoAiPropsBlock", aiProps: [] },
  "NoAiPropsDefinedBlock", // registered without an aiProps key
  { type: "ContentBlock", aiProps: ["content"] },
  { type: "ContentTitleBlock", aiProps: ["content", "title"] },
  { type: "SettingsBlock", aiProps: ["enabled", "count", "config"] },
  { type: "CoreKeysAiBlock", aiProps: ["_id", "_type", "_parent", "content"] },
  { type: "MixedBlock", aiProps: ["content", "title"] },
  { type: "HeadingBlock", aiProps: ["content", "title"] },
  { type: "ParagraphBlock", aiProps: ["content"] },
  { type: "ButtonBlock", aiProps: [] },
  { type: "TextBlock", aiProps: ["content"] },
  { type: "ImageBlock", aiProps: ["alt"] },
  { type: "DivBlock", aiProps: [] },
  { type: "ContainerBlock", aiProps: ["title"] },
  { type: "Heading", aiProps: ["content"] },
  { type: "Paragraph", aiProps: ["content"] },
  { type: "Image", aiProps: ["alt"] },
  { type: "Button", aiProps: ["text"] },
);

describe("pickOnlyAIProps", () => {
  describe("basic functionality", () => {
    it("should return an empty array when given empty blocks array", () => {
      const result = pickOnlyAIProps([], "en", false);
      expect(result).toEqual([]);
    });

    it("should filter out blocks with no AI props", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "NoAiPropsBlock",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([]);
    });

    it("should include only blocks with AI props", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: "test content",
          title: "test title",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: "test content",
          title: "test title",
        },
      ]);
    });

    it("should preserve core block properties (_id, _type, _parent)", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          _parent: "parent1",
          content: "test content",
          nonAiProp: "should not be included",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          _parent: "parent1",
          content: "test content",
        },
      ]);
    });

    it("should remove _parent property when it's empty", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          _parent: "",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "test content",
        },
      ]);
    });
  });

  describe("language handling", () => {
    it("should use language-specific values when available", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: "default content",
          "content-es": "contenido en español",
          title: "default title",
        },
      ];

      const result = pickOnlyAIProps(blocks, "es", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: "contenido en español",
          title: "default title",
        },
      ]);
    });

    it("should fallback to default value when language-specific value is empty", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
          "content-es": "   ", // empty/whitespace value
        },
      ];

      const result = pickOnlyAIProps(blocks, "es", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
        },
      ]);
    });

    it("should fallback to default value when language-specific value doesn't exist", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "fr", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
        },
      ]);
    });

    it("should handle non-string values correctly", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "SettingsBlock",
          enabled: true,
          count: 42,
          config: { key: "value" },
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "SettingsBlock",
          enabled: true,
          count: 42,
          config: { key: "value" },
        },
      ]);
    });
  });

  describe("translate prompt handling", () => {
    it("should use default values when isTranslatePrompt is true", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
          "content-es": "contenido en español",
        },
      ];

      const result = pickOnlyAIProps(blocks, "es", true);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content", // Should use default, not Spanish version
        },
      ]);
    });

    it("should use language-specific values when isTranslatePrompt is false", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
          "content-es": "contenido en español",
        },
      ];

      const result = pickOnlyAIProps(blocks, "es", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "contenido en español",
        },
      ]);
    });
  });

  describe("registered block handling", () => {
    it("should handle blocks with no registered definition", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "UnknownBlock",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([]);
    });

    it("should handle blocks with no aiProps defined", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "NoAiPropsDefinedBlock",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([]);
    });

    it("should handle blocks with empty aiProps array", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "NoAiPropsBlock",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([]);
    });
  });

  describe("multiple blocks handling", () => {
    it("should process multiple blocks correctly", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "HeadingBlock",
          content: "Heading content",
          title: "Heading title",
        },
        {
          _id: "block2",
          _type: "ParagraphBlock",
          content: "Paragraph content",
          style: "bold",
        },
        {
          _id: "block3",
          _type: "ButtonBlock",
          text: "Click me",
          action: "submit",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "HeadingBlock",
          content: "Heading content",
          title: "Heading title",
        },
        {
          _id: "block2",
          _type: "ParagraphBlock",
          content: "Paragraph content",
        },
      ]);
    });

    it("should filter out blocks with no AI properties from mixed results", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "TextBlock",
          content: "text content",
        },
        {
          _id: "block2",
          _type: "ImageBlock",
          src: "image.jpg",
          alt: "image alt",
        },
        {
          _id: "block3",
          _type: "DivBlock",
          className: "container",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "TextBlock",
          content: "text content",
        },
        {
          _id: "block2",
          _type: "ImageBlock",
          alt: "image alt",
        },
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle blocks with undefined properties", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: undefined,
          title: "test title",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: "", // get() with default "" returns empty string when undefined
          title: "test title",
        },
      ]);
    });

    it("should handle blocks with null values", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: null,
          title: "test title",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentTitleBlock",
          content: null,
          title: "test title",
        },
      ]);
    });

    it("should handle empty language string", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "test content",
        },
      ];

      const result = pickOnlyAIProps(blocks, "", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "test content",
        },
      ]);
    });

    it("should skip properties that match core block properties", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "CoreKeysAiBlock",
          _parent: "parent1",
          content: "test content",
        },
      ];

      // Even if aiProps includes core properties, they should be skipped in the loop

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "CoreKeysAiBlock",
          _parent: "parent1",
          content: "test content",
        },
      ]);
    });

    it("should trim whitespace from string values", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "default content",
          "content-es": "  contenido con espacios  ",
        },
      ];

      const result = pickOnlyAIProps(blocks, "es", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "ContentBlock",
          content: "contenido con espacios",
        },
      ]);
    });

    it("should handle complex nested block structures", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "parent",
          _type: "ContainerBlock",
          title: "Container Title",
          config: { layout: "grid" },
        },
        {
          _id: "child1",
          _type: "TextBlock",
          _parent: "parent",
          content: "Child 1 content",
        },
        {
          _id: "child2",
          _type: "ImageBlock",
          _parent: "parent",
          alt: "Child 2 alt text",
          src: "image.jpg",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "parent",
          _type: "ContainerBlock",
          title: "Container Title",
        },
        {
          _id: "child1",
          _type: "TextBlock",
          _parent: "parent",
          content: "Child 1 content",
        },
        {
          _id: "child2",
          _type: "ImageBlock",
          _parent: "parent",
          alt: "Child 2 alt text",
        },
      ]);
    });

    it("should handle large number of blocks efficiently", () => {
      const blocks: ChaiBlock[] = Array.from({ length: 100 }, (_, i) => ({
        _id: `block${i}`,
        _type: "ContentBlock",
        content: `Content ${i}`,
        title: `Title ${i}`,
      }));

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toHaveLength(100);
      expect(result[0]).toEqual({
        _id: "block0",
        _type: "ContentBlock",
        content: "Content 0",
      });
      expect(result[99]).toEqual({
        _id: "block99",
        _type: "ContentBlock",
        content: "Content 99",
      });
    });

    it("should handle mixed AI and non-AI properties", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "MixedBlock",
          content: "AI content",
          title: "AI title",
          style: "non-AI style",
          className: "non-AI class",
          metadata: { key: "non-AI metadata" },
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "block1",
          _type: "MixedBlock",
          content: "AI content",
          title: "AI title",
          // style, className, metadata should not be included
        },
      ]);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle typical blog post structure", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "heading1",
          _type: "Heading",
          content: "Blog Post Title",
          tag: "h1",
        },
        {
          _id: "para1",
          _type: "Paragraph",
          content: "This is the first paragraph of the blog post.",
        },
        {
          _id: "image1",
          _type: "Image",
          src: "/blog/image1.jpg",
          alt: "Descriptive alt text for the image",
        },
        {
          _id: "para2",
          _type: "Paragraph",
          content: "This is the second paragraph with more content.",
        },
      ];

      const result = pickOnlyAIProps(blocks, "en", false);
      expect(result).toEqual([
        {
          _id: "heading1",
          _type: "Heading",
          content: "Blog Post Title",
        },
        {
          _id: "para1",
          _type: "Paragraph",
          content: "This is the first paragraph of the blog post.",
        },
        {
          _id: "image1",
          _type: "Image",
          alt: "Descriptive alt text for the image",
        },
        {
          _id: "para2",
          _type: "Paragraph",
          content: "This is the second paragraph with more content.",
        },
      ]);
    });

    it("should handle multilingual content correctly", () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "heading1",
          _type: "Heading",
          content: "Welcome",
          "content-es": "Bienvenidos",
          "content-fr": "Bienvenue",
        },
        {
          _id: "button1",
          _type: "Button",
          text: "Click here",
          "text-es": "Haz clic aquí",
          "text-fr": "Cliquez ici",
          color: "blue",
        },
      ];

      // Test English

      const resultEn = pickOnlyAIProps(blocks, "en", false);
      expect(resultEn).toEqual([
        {
          _id: "heading1",
          _type: "Heading",
          content: "Welcome",
        },
        {
          _id: "button1",
          _type: "Button",
          text: "Click here",
        },
      ]);

      const resultEs = pickOnlyAIProps(blocks, "es", false);
      expect(resultEs).toEqual([
        {
          _id: "heading1",
          _type: "Heading",
          content: "Bienvenidos",
        },
        {
          _id: "button1",
          _type: "Button",
          text: "Haz clic aquí",
        },
      ]);

      const resultFr = pickOnlyAIProps(blocks, "fr", false);
      expect(resultFr).toEqual([
        {
          _id: "heading1",
          _type: "Heading",
          content: "Bienvenue",
        },
        {
          _id: "button1",
          _type: "Button",
          text: "Cliquez ici",
        },
      ]);
    });
  });
});
