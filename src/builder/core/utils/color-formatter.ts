import * as culori from "culori";

type ColorFormat = "hsl" | "rgb" | "oklch" | "hex";

export const formatNumber = (num?: number) => {
  if (!num) return "0";
  return num % 1 === 0 ? num : num.toFixed(4);
};

export const formatHsl = (hsl: culori.Hsl) => {
  return `hsl(${formatNumber(hsl.h)} ${formatNumber(hsl.s * 100)}% ${formatNumber(hsl.l * 100)}%)`;
};
export const colorFormatter = (colorValue: string, format: ColorFormat = "hsl"): string => {
  try {
    const color = culori.parse(colorValue);
    if (!color) throw new Error("Invalid color input");

    switch (format) {
      case "hsl": {
        return formatHsl(culori.converter("hsl")(color));
      }
      case "rgb":
        return culori.formatRgb(color);
      case "oklch": {
        const oklch = culori.converter("oklch")(color);
        return `oklch(${formatNumber(oklch.l)} ${formatNumber(oklch.c)} ${formatNumber(oklch.h)})`;
      }
      case "hex":
        return culori.formatHex(color);
      default:
        return colorValue;
    }
  } catch (error) {
    console.error(`Failed to convert color: ${colorValue}`, error);
    return colorValue;
  }
};

// Helper function to convert any color to hex
export const toHex = (colorValue: string): string => {
  return colorFormatter(colorValue, "hex");
};
