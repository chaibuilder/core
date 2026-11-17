import twForms from "@tailwindcss/forms";
import twTypography from "@tailwindcss/typography";
import { ChaiBlock } from "~/types/common";
// Compat entry (not ../tailwind): getStylesForBlocks shares the compile path used by
// consumers of the published package.
import { blocksToStylesMarkup } from "../server/chai-builder/public/styles-markup";
import { compileTailwindCss } from "../utils/tailwind-css-compat";
import { chaiBuilderPlugin, getChaiBuilderTheme } from "../utils";

async function getTailwindCSS(markupString: string[], safelist: string[] = [], includeBaseStyles: boolean = false) {
  return compileTailwindCss({
    markupStrings: markupString,
    safelist,
    includeBaseStyles,
    config: {
      darkMode: "class",
      theme: {
        extend: {
          ...getChaiBuilderTheme(),
          keyframes: {
            "accordion-down": {
              from: {
                height: "0",
              },
              to: {
                height: "var(--radix-accordion-content-height)",
              },
            },
            "accordion-up": {
              from: {
                height: "var(--radix-accordion-content-height)",
              },
              to: {
                height: "0",
              },
            },
          },
          animation: {
            "accordion-down": "accordion-down 0.2s ease-out",
            "accordion-up": "accordion-up 0.2s ease-out",
          },
        },
      },
      plugins: [twForms, twTypography, chaiBuilderPlugin],
      corePlugins: { preflight: includeBaseStyles },
    },
  });
}

/**
 * Get the tailwind css for the blocks
 * @param blocks - The blocks to get the tailwind css for
 * @param includeBaseStyles - Whether to include the base styles
 * @returns The tailwind css for the blocks
 */
const getBlocksTailwindCSS = (blocks: ChaiBlock[], includeBaseStyles: boolean) => {
  return getTailwindCSS([blocksToStylesMarkup(blocks)], [], includeBaseStyles);
};

/**
 * Get the tailwind css for the blocks
 * @param blocks - The blocks to get the tailwind css for
 * @param includeBaseStyles - Whether to include the base styles
 * @returns The tailwind css for the blocks
 */
export const getStylesForBlocks = async (blocks: ChaiBlock[], includeBaseStyles: boolean = false): Promise<string> => {
  return await getBlocksTailwindCSS(blocks, includeBaseStyles);
};

if (import.meta.vitest) {
  describe("getStylesForBlocks", () => {
    it("should generate CSS for a class in a #styles: string", async () => {
      const blocks: ChaiBlock[] = [{ _id: "b1", _type: "div", styles: "#styles:,bg-red-500", _name: "T" }];
      const css = await getStylesForBlocks(blocks);
      expect(css).toContain("bg-red-500");
    });

    it("should pick up classes from the standard #styles: format", async () => {
      const blocks: ChaiBlock[] = [{ _id: "b1", _type: "div", styles: "#styles:,py-4 text-white", _name: "T" }];
      const css = await getStylesForBlocks(blocks);
      expect(css).toContain("py-4");
      expect(css).toContain("text-white");
    });

    it("should not include preflight when includeBaseStyles is false", async () => {
      const blocks: ChaiBlock[] = [{ _id: "b1", _type: "div", styles: "#styles:,text-sm", _name: "T" }];
      const css = await getStylesForBlocks(blocks, false);
      expect(css).not.toContain("box-sizing");
    });

    it("should include preflight when includeBaseStyles is true", async () => {
      const blocks: ChaiBlock[] = [{ _id: "b1", _type: "div", styles: "#styles:,text-sm", _name: "T" }];
      const css = await getStylesForBlocks(blocks, true);
      expect(css).toContain("box-sizing");
    });

    it("should generate CSS for complex arbitrary gradient and bg-size classes", async () => {
      const blocks: ChaiBlock[] = [
        {
          _id: "b1",
          _type: "div",
          styles:
            "#styles:,bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]",
          _name: "T",
        },
      ];
      const css = await getStylesForBlocks(blocks);
      expect(css).toContain("background-image");
      expect(css).toContain(
        "linear-gradient(to right,#80808012 1px,transparent 1px),linear-gradient(to bottom,#80808012 1px,transparent 1px)",
      );
      expect(css).toContain("background-size");
      expect(css).toContain("24px 24px");
    });

    it("splits #styles media,base commas so both candidates compile", async () => {
      const blocks: ChaiBlock[] = [{ _id: "b1", _type: "div", styles: "#styles:md:flex,hidden", _name: "T" }];
      const css = await getStylesForBlocks(blocks);
      expect(css).toMatch(/(?:^|[^\w-])\.hidden\s*\{/);
      expect(css).toContain("md\\:flex");
    });
  });
}
