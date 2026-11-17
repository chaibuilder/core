import { getChaiThemeOptions } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { defaultThemeOptions } from "~/builder/hooks/default-theme-options";
import { ChaiThemeOptions } from "~/types/chaibuilder-editor-props";

export const getChaiTailwindTheme = (themeOptions: ChaiThemeOptions = defaultThemeOptions) => {
  return {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    ...getChaiThemeOptions(themeOptions),
  };
};
