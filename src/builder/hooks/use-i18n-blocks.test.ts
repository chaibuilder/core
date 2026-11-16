/**
 * @vitest-environment happy-dom
 */
import { useI18nBlocks } from "~/builder/hooks/use-i18n-blocks";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";

registerTestBlocks({ type: "Heading", i18nProps: ["content"] });

describe("useI18nBlocks", () => {
  it("sends the default-language text for blank translations, whitespace included", () => {
    const { result } = renderHookInBuilder(() => useI18nBlocks(), {
      blocks: [
        { _id: "a", _type: "Heading", content: "Bonjour", "content-en": "   " },
        { _id: "b", _type: "Heading", content: "Salut", "content-en": "" },
        { _id: "c", _type: "Heading", content: "Allo", "content-en": "Hello" },
      ],
    });

    expect(result.current("en")).toEqual([
      { _id: "a", content: "Bonjour" },
      { _id: "b", content: "Salut" },
      { _id: "c", "content-en": "Hello" },
    ]);
  });
});
