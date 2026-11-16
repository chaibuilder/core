import twContainer from "@tailwindcss/container-queries";
import twForms from "@tailwindcss/forms";
import twTypography from "@tailwindcss/typography";
import type { ChaiBlock } from "~/types";
import { getChaiBuilderTheme } from "~/utils";
// Compat entry (not ~/tailwind): shared compile path used by the server styles pipeline for
// v4 consumers of the published package.
import { compileTailwindCss } from "~/utils/tailwind-css-compat";
import { blocksToStylesMarkup } from "./styles-markup";

const getPageTailwindConfig = () => ({
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
  plugins: [twForms, twTypography, twContainer],
  corePlugins: { preflight: false },
});

export const getBlocksStyles = async (blocks: ChaiBlock[]): Promise<string> => {
  return compileTailwindCss({
    markupStrings: [blocksToStylesMarkup(blocks)],
    includeBaseStyles: false,
    config: getPageTailwindConfig(),
  });
};

const siteLayoutStyles = new Map<string, Promise<string>>();

// Compiles the site layout rule once per distinct CSS input.
export const getSiteLayoutStyles = (css: string): Promise<string> => {
  if (!css) return Promise.resolve("");
  let styles = siteLayoutStyles.get(css);
  if (!styles) {
    styles = compileTailwindCss({ markupStrings: [], config: getPageTailwindConfig(), extraCss: css }).then((out) =>
      out.replace(/\s+/g, " ").trim(),
    );
    styles.catch(() => siteLayoutStyles.delete(css));
    siteLayoutStyles.set(css, styles);
  }
  return styles;
};
