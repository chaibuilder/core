import { ChaiBlockConfig } from "~/types/blocks";
import { ChaiBlock } from "~/types/common";
import { applyLanguage } from "./new-blocks-render-helpers";

describe("applyLanguage", () => {
  const mockChaiBlock: ChaiBlockConfig = {
    i18nProps: ["title", "content", "buttonText"],
    type: "mock",
    label: "Mock Block",
    group: "Mock",
  };

  const createMockBlock = (overrides: Partial<ChaiBlock> = {}): ChaiBlock => ({
    _id: "test-block-1",
    _type: "text",
    title: "Original Title",
    content: "Original Content",
    buttonText: "Original Button",
    nonI18nProp: "Non-translatable",
    ...overrides,
  });

  describe("when selectedLang is empty", () => {
    it("should return the original block when selectedLang is empty string", () => {
      const block = createMockBlock();
      const result = applyLanguage(block, "", mockChaiBlock);

      expect(result).toBe(block);
      expect(result).toEqual(block);
    });

    it("should return the original block when selectedLang is null", () => {
      const block = createMockBlock();
      const result = applyLanguage(block, null as any, mockChaiBlock);

      expect(result).toBe(block);
    });

    it("should return the original block when selectedLang is undefined", () => {
      const block = createMockBlock();
      const result = applyLanguage(block, undefined as any, mockChaiBlock);

      expect(result).toBe(block);
    });
  });

  describe("when i18nProps is empty", () => {
    it("should return the original block when i18nProps is empty array", () => {
      const block = createMockBlock();
      const chaiBlockWithEmptyI18n = { ...mockChaiBlock, i18nProps: [] };
      const result = applyLanguage(block, "en", chaiBlockWithEmptyI18n);

      expect(result).toBe(block);
    });

    it("should return the original block when i18nProps is undefined", () => {
      const block = createMockBlock();
      const chaiBlockWithoutI18n = { ...mockChaiBlock, i18nProps: undefined };
      const result = applyLanguage(block, "en", chaiBlockWithoutI18n);

      expect(result).toBe(block);
    });

    it("should return the original block when i18nProps is null", () => {
      const block = createMockBlock();
      const chaiBlockWithNullI18n = { ...mockChaiBlock, i18nProps: undefined };
      const result = applyLanguage(block, "en", chaiBlockWithNullI18n);

      expect(result).toBe(block);
    });
  });

  describe("when applying language translations", () => {
    it("should clone the block and apply language-specific values", () => {
      const block = createMockBlock({
        "title-en": "English Title",
        "content-en": "English Content",
        "buttonText-en": "English Button",
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      // Should return a new object (cloned)
      expect(result).not.toBe(block);

      // Should apply the language-specific values
      expect(result.title).toBe("English Title");
      expect(result.content).toBe("English Content");
      expect(result.buttonText).toBe("English Button");

      // Should preserve non-i18n properties
      expect(result.nonI18nProp).toBe("Non-translatable");

      // Should preserve the original language-specific properties
      expect(result["title-en"]).toBe("English Title");
    });

    it("should trim whitespace from translated values from the start", () => {
      const block = createMockBlock({
        "title-en": "  English Title  ",
        "content-en": "\n\tEnglish Content\n  ",
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      expect(result.title).toBe("English Title  ");
      expect(result.content).toBe("English Content\n  ");
    });

    it("should fall back to original value when translated value is empty string", () => {
      const block = createMockBlock({
        "title-en": "",
        "content-en": "   ", // whitespace only
        "buttonText-en": "English Button",
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      expect(result.title).toBe("Original Title"); // fallback to original
      expect(result.content).toBe("Original Content"); // fallback to original (whitespace trimmed to empty)
      expect(result.buttonText).toBe("English Button");
    });

    it("should fall back to original value when translated property doesn't exist", () => {
      const block = createMockBlock({
        "title-en": "English Title",
        // content-en and buttonText-en are missing
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      expect(result.title).toBe("English Title");
      expect(result.content).toBe("Original Content"); // fallback to original
      expect(result.buttonText).toBe("Original Button"); // fallback to original
    });

    it("should handle non-string values in translated properties", () => {
      const block = createMockBlock({
        "title-en": 123, // number
        "content-en": null, // null
        "buttonText-en": { nested: "object" }, // object
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      // Non-string values should fall back to original
      expect(result.title).toBe("Original Title");
      expect(result.content).toBe("Original Content");
      expect(result.buttonText).toBe("Original Button");
    });

    it("should only apply translations for properties listed in i18nProps", () => {
      const block = createMockBlock({
        "title-en": "English Title",
        "nonI18nProp-en": "Should not be applied",
        "randomProp-en": "Should not be applied",
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      expect(result.title).toBe("English Title");
      expect(result.nonI18nProp).toBe("Non-translatable"); // unchanged
      expect(result.randomProp).toBeUndefined(); // unchanged
    });

    it("should work with different language codes", () => {
      const block = createMockBlock({
        "title-es": "Título en Español",
        "title-fr": "Titre en Français",
        "content-es": "Contenido en Español",
        "content-fr": "Contenu en Français",
      });

      const resultEs = applyLanguage(block, "es", mockChaiBlock);
      expect(resultEs.title).toBe("Título en Español");
      expect(resultEs.content).toBe("Contenido en Español");

      const resultFr = applyLanguage(block, "fr", mockChaiBlock);
      expect(resultFr.title).toBe("Titre en Français");
      expect(resultFr.content).toBe("Contenu en Français");
    });

    it("should not create new properties when original properties don't exist", () => {
      const block: ChaiBlock = {
        _id: "test-block-2",
        _type: "text",
        "title-en": "English Title",
        "content-en": "English Content",
        // No original title or content properties
      };

      const result = applyLanguage(block, "en", mockChaiBlock);

      // The function only processes existing keys, so title and content won't be created
      expect(result.title).toBeUndefined();
      expect(result.content).toBeUndefined();
      // But the language-specific properties should still exist
      expect(result["title-en"]).toBe("English Title");
      expect(result["content-en"]).toBe("English Content");
    });

    it("should preserve block metadata properties", () => {
      const block = createMockBlock({
        _parent: "parent-block",
        _bindings: { test: "binding" },
        _libBlock: "lib-block",
        "title-en": "English Title",
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      expect(result._id).toBe("test-block-1");
      expect(result._type).toBe("text");
      expect(result._parent).toBe("parent-block");
      expect(result._bindings).toEqual({ test: "binding" });
      expect(result._libBlock).toBe("lib-block");
      expect(result.title).toBe("English Title");
    });
  });

  describe("edge cases", () => {
    it("should handle empty i18nProps with valid selectedLang", () => {
      const block = createMockBlock();
      const chaiBlockEmpty = { ...mockChaiBlock, i18nProps: [] };
      const result = applyLanguage(block, "en", chaiBlockEmpty);

      expect(result).toBe(block);
    });

    it("should handle blocks with complex nested properties", () => {
      const complexBlock = createMockBlock({
        nestedObject: { prop: "value" },
        arrayProp: ["item1", "item2"],
        "title-en": "English Title",
      });

      const result = applyLanguage(complexBlock, "en", mockChaiBlock);

      expect(result.nestedObject).toEqual({ prop: "value" });
      expect(result.arrayProp).toEqual(["item1", "item2"]);
      expect(result.title).toBe("English Title");
    });

    it("should handle special characters in language codes", () => {
      const block = createMockBlock({
        "title-zh-CN": "中文标题",
        "content-pt-BR": "Conteúdo em Português",
      });

      const resultZh = applyLanguage(block, "zh-CN", mockChaiBlock);
      expect(resultZh.title).toBe("中文标题");

      const resultPt = applyLanguage(block, "pt-BR", mockChaiBlock);
      expect(resultPt.content).toBe("Conteúdo em Português");
    });

    it("should handle boolean false values correctly", () => {
      const block = createMockBlock({
        title: true,
        "title-en": false,
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      // Boolean false should fall back to original value
      expect(result.title).toBe(true);
    });

    it("should handle zero values correctly", () => {
      const block = createMockBlock({
        title: "Original",
        "title-en": 0,
      });

      const result = applyLanguage(block, "en", mockChaiBlock);

      // Number 0 should fall back to original value
      expect(result.title).toBe("Original");
    });

    it("should handle very long language codes", () => {
      const longLangCode = "very-long-language-code-that-might-break-things";
      const block = createMockBlock({
        [`title-${longLangCode}`]: "Long Language Title",
      });

      const result = applyLanguage(block, longLangCode, mockChaiBlock);

      expect(result.title).toBe("Long Language Title");
    });

    it("should handle language codes with numbers", () => {
      const block = createMockBlock({
        "title-lang123": "Numeric Language Title",
      });

      const result = applyLanguage(block, "lang123", mockChaiBlock);

      expect(result.title).toBe("Numeric Language Title");
    });
  });

  describe("i18nDefaultProps", () => {
    const config: ChaiBlockConfig = { ...mockChaiBlock, i18nDefaultProps: ["buttonText"] };

    it("renders a blank translation as unset instead of the fallback value", () => {
      const result = applyLanguage(createMockBlock({ "buttonText-fr": "  " }), "fr", config);
      expect(result.buttonText).toBeUndefined();
      expect(result.title).toBe("Original Title");
    });

    it("renders a translation on a block without the bare prop", () => {
      const { buttonText: _omit, ...block } = createMockBlock({ "buttonText-fr": "Bouton" });
      expect(applyLanguage(block as ChaiBlock, "fr", config).buttonText).toBe("Bouton");
    });

    it("renders a structured translation and clears an empty one", () => {
      const listConfig: ChaiBlockConfig = { ...mockChaiBlock, i18nDefaultProps: ["title"] };
      expect(applyLanguage(createMockBlock({ "title-fr": ["a"] }), "fr", listConfig).title).toEqual(["a"]);
      expect(applyLanguage(createMockBlock({ "title-fr": [] }), "fr", listConfig).title).toBeUndefined();
    });

    it("renders a non-blank translation", () => {
      const result = applyLanguage(createMockBlock({ "buttonText-fr": "Bouton" }), "fr", config);
      expect(result.buttonText).toBe("Bouton");
    });
  });
});
