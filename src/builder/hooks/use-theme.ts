import { atom, useAtom } from "jotai";
import { isEmpty } from "lodash-es";
import { useMemo } from "react";
import { defaultThemeOptions, defaultThemeValues } from "~/builder/hooks/default-theme-options";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { ChaiBorderRadiusValue, ChaiTheme, ChaiThemeOptions } from "~/types/chaibuilder-editor-props";

export const getDefaultThemeValues = (options: ChaiThemeOptions = defaultThemeOptions): ChaiTheme => {
  const themeValues: ChaiTheme = defaultThemeValues;

  if (options.fontFamily) {
    themeValues.fontFamily = Object.entries(options.fontFamily).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key.replace("font-", "")]: value,
      }),
      themeValues.fontFamily,
    );
  }

  // @ts-expect-error - borderRadius is a string in options but ChaiBorderRadiusValue in themeValues
  themeValues.borderRadius = options.borderRadius as ChaiBorderRadiusValue;

  if (options.colors) {
    themeValues.colors = options.colors.reduce((acc, colorGroup) => {
      Object.entries(colorGroup.items).forEach(([key, values]) => {
        if (key in acc) {
          acc[key as keyof typeof acc] = values;
        }
      });
      return acc;
    }, themeValues.colors) as ChaiTheme["colors"];
  }

  return themeValues;
};

// Create a new atom for changeable theme values, initialized with default values
export const chaiThemeValuesAtom = atom<ChaiTheme | Partial<ChaiTheme>>({});

export const useTheme = () => {
  const options = useThemeOptions();
  const defaultThemeValues = useMemo(() => getDefaultThemeValues(options), [options]);
  const theme = useBuilderProp("theme", {});
  const [chaiTheme, setChaiTheme] = useAtom(chaiThemeValuesAtom);

  const themeValues = useMemo(
    () =>
      ({
        ...defaultThemeValues,
        ...(!isEmpty(theme) && theme),
        ...(!isEmpty(chaiTheme) && chaiTheme),
      }) as ChaiTheme,
    [defaultThemeValues, theme, chaiTheme],
  );
  return [themeValues, setChaiTheme] as const;
};

export const useThemeOptions = () => {
  const getThemeOptions = useBuilderProp("themeOptions", (themeOptions: ChaiThemeOptions) => themeOptions);
  const defaultOptions = useMemo(() => getThemeOptions(defaultThemeOptions), [getThemeOptions]);
  return defaultOptions as ChaiThemeOptions;
};

const rightPanelAtom = atom<"block" | "theme" | "ai" | "settings">("block");
export const useRightPanel = () => {
  return useAtom(rightPanelAtom);
};

/** Tabs of the Global styles right panel (`rightPanel === "theme"`). */
export type GlobalStylesTab = "theme" | "designTokens";

export const globalStylesTabAtom = atom<GlobalStylesTab>("theme");
export const useGlobalStylesTab = () => {
  return useAtom(globalStylesTabAtom);
};

const activeSettingsTabAtom = atom<"settings" | "styles">("settings");
export const useActiveSettingsTab = () => {
  return useAtom(activeSettingsTabAtom);
};
