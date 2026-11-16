import { handlei18N } from "~/builder/hooks/use-html-to-blocks";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { ChaiBlock } from "~/types/common";

// Real registry entries; "UnregisteredParagraph" is deliberately never registered.
registerTestBlocks(
  "PlainParagraph", // no i18nProps
  { type: "I18nParagraph", i18nProps: ["content"] },
  { type: "I18nButton", i18nProps: ["content", "label"] },
);

describe("handlei18N", () => {
  it("should return blocks unchanged when no block definition exists", () => {
    const blocks: ChaiBlock[] = [{ _type: "UnregisteredParagraph", _id: "1", content: "Hello" }];
    // a matching translated block exists, but without i18n config nothing may be merged
    const currentBlocks: ChaiBlock[] = [
      { _type: "UnregisteredParagraph", _id: "2", content: "Hello", "content-es": "Hola" },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual(blocks);
  });

  it("should return blocks unchanged when block definition has no i18nProps", () => {
    const blocks: ChaiBlock[] = [{ _type: "PlainParagraph", _id: "1", content: "Hello" }];
    // a matching translated block exists, but without i18n config nothing may be merged
    const currentBlocks: ChaiBlock[] = [{ _type: "PlainParagraph", _id: "2", content: "Hello", "content-es": "Hola" }];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual(blocks);
  });

  it("should merge i18n values when matching block is found in currentBlocks", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nParagraph", _id: "1", content: "Hello" }];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "2",
        content: "Hello",
        "content-es": "Hola",
        "content-fr": "Bonjour",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([
      {
        _type: "I18nParagraph",
        _id: "1",
        content: "Hello",
        "content-es": "Hola",
        "content-fr": "Bonjour",
      },
    ]);
  });

  it("should handle multiple i18n properties", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nButton", _id: "1", content: "Click me", label: "Submit" }];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nButton",
        _id: "2",
        content: "Click me",
        "content-es": "Haz clic",
        label: "Submit",
        "label-es": "Enviar",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([
      {
        _type: "I18nButton",
        _id: "1",
        content: "Click me",
        label: "Submit",
        "content-es": "Haz clic",
        "label-es": "Enviar",
      },
    ]);
  });

  it("should handle trimmed content matching", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nParagraph", _id: "1", content: "  Hello  " }];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "2",
        content: "Hello",
        "content-es": "Hola",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([
      {
        _type: "I18nParagraph",
        _id: "1",
        content: "  Hello  ",
        "content-es": "Hola",
      },
    ]);
  });

  it("should not merge when no matching content is found", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nParagraph", _id: "1", content: "Hello" }];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "2",
        content: "Goodbye",
        "content-es": "Adiós",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([{ _type: "I18nParagraph", _id: "1", content: "Hello" }]);
  });

  it("should handle multiple blocks of the same type", () => {
    const blocks: ChaiBlock[] = [
      { _type: "I18nParagraph", _id: "1", content: "Hello" },
      { _type: "I18nParagraph", _id: "2", content: "World" },
    ];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "3",
        content: "Hello",
        "content-es": "Hola",
      },
      {
        _type: "I18nParagraph",
        _id: "4",
        content: "World",
        "content-es": "Mundo",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([
      {
        _type: "I18nParagraph",
        _id: "1",
        content: "Hello",
        "content-es": "Hola",
      },
      {
        _type: "I18nParagraph",
        _id: "2",
        content: "World",
        "content-es": "Mundo",
      },
    ]);
  });

  it("should only merge i18n keys with correct prefix", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nParagraph", _id: "1", content: "Hello" }];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "2",
        content: "Hello",
        "content-es": "Hola",
        "content-fr": "Bonjour",
        "title-es": "Título", // Should not be merged as it's not content-*
        otherProp: "value", // Should not be merged
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([
      {
        _type: "I18nParagraph",
        _id: "1",
        content: "Hello",
        "content-es": "Hola",
        "content-fr": "Bonjour",
      },
    ]);
    expect(result[0]).not.toHaveProperty("title-es");
    expect(result[0]).not.toHaveProperty("otherProp");
  });

  it("should handle empty blocks array", () => {
    const blocks: ChaiBlock[] = [];
    const currentBlocks: ChaiBlock[] = [
      {
        _type: "I18nParagraph",
        _id: "1",
        content: "Hello",
        "content-es": "Hola",
      },
    ];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([]);
  });

  it("should handle empty currentBlocks array", () => {
    const blocks: ChaiBlock[] = [{ _type: "I18nParagraph", _id: "1", content: "Hello" }];
    const currentBlocks: ChaiBlock[] = [];

    const result = handlei18N(blocks, currentBlocks);

    expect(result).toEqual([{ _type: "I18nParagraph", _id: "1", content: "Hello" }]);
  });
});
