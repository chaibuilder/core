import { each, isString, keys } from "lodash-es";
import { generateClassNames } from "~/builder/core/components/canvas/static/new-blocks-render-helpers";
import { STYLES_KEY } from "~/constants/STRINGS";
import { ChaiBlock } from "~/types/common";
import { ChaiDesignTokens } from "~/types/types";

export const applyChaiDesignTokens = (blocks: ChaiBlock[], designTokens: ChaiDesignTokens) => {
  return blocks.map((block) => {
    const styleKeys = keys(block).filter((key) => isString(block[key]) && block[key].startsWith(STYLES_KEY));
    if (styleKeys.length === 0) return block;
    // Blocks may be shared cached objects (unstable_cache / request cache);
    // never write resolved styles back onto the input.
    const resolvedBlock = { ...block };
    each(styleKeys, (styleKey) => {
      resolvedBlock[styleKey] = `${STYLES_KEY},${generateClassNames(block[styleKey], designTokens)}`;
    });
    return resolvedBlock;
  });
};

if (import.meta.vitest) {
  describe("applyDesignTokens", () => {
    const mockDesignTokens: ChaiDesignTokens = {
      "dt#token1": { name: "primary-color", value: "bg-blue-500" },
    };

    it("should not mutate the input blocks", () => {
      const input: ChaiBlock[] = [
        {
          _id: "block1",
          _type: "div",
          styles: "#styles:,dt#token1 bg-white",
          _name: "Shared Cached Block",
        },
      ];
      const snapshot = structuredClone(input);

      const result = applyChaiDesignTokens(input, mockDesignTokens);

      expect(input).toEqual(snapshot);
      expect(result[0]).not.toBe(input[0]);
      expect(result[0].styles).toBe("#styles:,bg-white");
      // Re-applying on the untouched input must yield the same result
      expect(applyChaiDesignTokens(input, mockDesignTokens)[0].styles).toBe("#styles:,bg-white");
    });
  });
}
