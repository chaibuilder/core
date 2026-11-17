import { getRegisteredChaiFonts } from "~/registry";
import { ChaiTheme } from "~/types/chaibuilder-editor-props";
import { toHex } from "./color-formatter";

/**
 * Parses CSS input and converts it to ChaiThemeValues format
 */
export const parseToChaiThemeValues = (cssInput: string): ChaiTheme => {
  const result: ChaiTheme = {
    fontFamily: {
      heading: "",
      body: "",
    },
    borderRadius: "",
    colors: {} as any,
  };

  try {
    // Validate CSS input first
    const validation = validateCssInput(cssInput);
    if (!validation.isValid) {
      console.warn("CSS validation failed:", validation.error);
      // Return default values instead of throwing
      return getDefaultThemeValues();
    }

    const lightColors = extractCssBlockContent(cssInput, ":root");
    const darkColors = extractCssBlockContent(cssInput, ".dark");

    // Parse font families - extract only the first font name
    const fontSans =
      extractVariableValue(lightColors, "--font-sans") ||
      extractVariableValue(lightColors, "--font-family") ||
      extractVariableValue(lightColors, "--font-heading") ||
      extractVariableValue(lightColors, "--font-body");

    const processedFont = processFontFamily(fontSans);
    result.fontFamily = {
      heading: processedFont,
      body: processedFont,
    };

    // Parse border radius - convert to px format
    const borderRadiusValue =
      extractVariableValue(lightColors, "--radius") || extractVariableValue(lightColors, "--border-radius") || "0.5rem";
    result.borderRadius = convertToPx(borderRadiusValue);

    // Define color mappings
    const colorMappings = [
      "background",
      "foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "destructive-foreground",
      "border",
      "input",
      "ring",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
    ];

    // Parse colors
    colorMappings.forEach((colorName) => {
      const lightValue = extractVariableValue(lightColors, `--${colorName}`);
      const darkValue = extractVariableValue(darkColors, `--${colorName}`);

      if (lightValue || darkValue) {
        const lightColor = lightValue ? processAndFormatColor(lightValue) : "#000000";
        const darkColor = darkValue ? processAndFormatColor(darkValue) : lightColor;
        result.colors[colorName as keyof typeof result.colors] = [lightColor, darkColor];
      }
    });
  } catch (error) {
    console.error("Error parsing CSS to ChaiThemeValues:", error);
    // Return default values instead of broken state
    return getDefaultThemeValues();
  }

  return result;
};

/**
 * Helper function to extract CSS block content
 */
const extractCssBlockContent = (input: string, selector: string): string | null => {
  const regex = new RegExp(`${escapeRegExp(selector)}\\s*{([^}]+)}`);
  return input.match(regex)?.[1]?.trim() || null;
};

/**
 * Helper function to extract variable value
 */
const extractVariableValue = (cssContent: string | null, variableName: string): string | null => {
  if (!cssContent) return null;

  const regex = new RegExp(`${escapeRegExp(variableName)}\\s*:\\s*([^;]+)`);
  const match = cssContent.match(regex);
  return match?.[1]?.trim() || null;
};

/**
 * Processes and formats any color value to a consistent hex format
 * Handles various color formats including named colors, rgb/rgba, hsl/hsla, oklch, and hex
 */
const processAndFormatColor = (value: string): string => {
  if (!value || typeof value !== "string") {
    return "#000000";
  }

  try {
    // Remove any var() references and trim whitespace
    const cleanValue = value.replace(/var\([^)]+\)/g, "").trim();

    // Handle empty or invalid values
    if (!cleanValue) return "#000000";

    // Handle CSS color keywords (like 'red', 'blue', etc.)
    if (/^[a-z]+$/i.test(cleanValue)) {
      return toHex(cleanValue) || "#000000";
    }

    // Handle hex values (with or without #)
    if (/^#?([0-9A-F]{3,4}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(cleanValue.replace(/#/g, ""))) {
      const hex = cleanValue.startsWith("#") ? cleanValue : `#${cleanValue}`;
      // Ensure 6-digit hex for consistency
      if (hex.length <= 5) {
        // Handle #RGB or #RGBA
        return `#${hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")}`.slice(0, 7);
      }
      return hex.length > 7 ? hex.slice(0, 7) : hex; // Remove alpha channel if present
    }

    // Handle functional notations (rgb, rgba, hsl, hsla, oklch)
    if (/^(rgb|hsl|oklch)a?\(/i.test(cleanValue)) {
      return toHex(cleanValue) || "#000000";
    }

    // Handle space separated HSL values (e.g., "200 23.0769% 97.4510%")
    const hslSpaceMatch = cleanValue.match(/^(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%$/);
    if (hslSpaceMatch) {
      const [, h, s, l] = hslSpaceMatch;
      const colorStr = `hsl(${h} ${s}% ${l}%)`;
      return toHex(colorStr) || "#000000";
    }

    // Handle space/comma separated values (common in CSS)
    if (/^[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+[\d.]+)?$/.test(cleanValue)) {
      // If it looks like RGB or HSL values without function wrapper
      const parts = cleanValue.split(/[\s,]+/).filter(Boolean);
      if (parts.length >= 3) {
        // Try to determine if it's HSL (has % units) or RGB
        const isHsl = parts.some((p) => p.includes("%"));
        const colorStr = isHsl
          ? `hsl(${parts[0]} ${parts[1]} ${parts[2]})`
          : `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
        return toHex(colorStr) || "#000000";
      }
    }

    // Default fallback for any other format
    return toHex(cleanValue) || "#000000";
  } catch (error) {
    console.warn("Failed to process color:", value, error);
    return "#000000";
  }
};

/**
 * Helper function to process font family and extract only the first font name
 */
const processFontFamily = (fontValue: string | null): string => {
  const registeredFonts = getRegisteredChaiFonts();
  if (!fontValue) {
    return "ui-sans-serif, system-ui, sans-serif";
  }
  try {
    // Remove quotes and extra whitespace
    const cleanFont = fontValue.replace(/["']/g, "").trim();

    // Split by comma and take the first font name
    const firstFont = cleanFont.split(",")[0].trim();
    const fontFamily = registeredFonts.find((font) => font.family.toLowerCase() === firstFont.toLowerCase());

    // Return the first font name, or fallback if empty
    return fontFamily?.family || "ui-sans-serif, system-ui, sans-serif";
  } catch (error) {
    console.warn("Error processing font family:", fontValue, error);
    return "ui-sans-serif, system-ui, sans-serif";
  }
};

/**
 * Helper function to convert border radius values to px format
 */
const convertToPx = (value: string): string => {
  if (!value) {
    return "8px";
  }

  try {
    // Remove extra whitespace
    const cleanValue = value.trim();

    // If already in px, return as is
    if (cleanValue.endsWith("px")) {
      return cleanValue;
    }

    // Convert rem to px (assuming 1rem = 16px)
    if (cleanValue.endsWith("rem")) {
      const numValue = parseFloat(cleanValue.replace("rem", ""));
      if (!isNaN(numValue)) {
        return `${Math.round(numValue * 16)}px`;
      }
    }

    // Convert em to px (assuming 1em = 16px)
    if (cleanValue.endsWith("em")) {
      const numValue = parseFloat(cleanValue.replace("em", ""));
      if (!isNaN(numValue)) {
        return `${Math.round(numValue * 16)}px`;
      }
    }

    // If it's just a number, assume px
    const numValue = parseFloat(cleanValue);
    if (!isNaN(numValue)) {
      return `${Math.round(numValue)}px`;
    }

    // Fallback for any other format
    return "8px";
  } catch (error) {
    console.warn("Error converting border radius to px:", value, error);
    return "8px";
  }
};

/**
 * Helper function to get default theme values
 */
const getDefaultThemeValues = (): ChaiTheme => {
  return {
    fontFamily: {
      heading: "ui-sans-serif, system-ui, sans-serif",
      body: "ui-sans-serif, system-ui, sans-serif",
    },
    borderRadius: "8px",
    colors: {
      background: ["#ffffff", "#000000"],
      foreground: ["#000000", "#ffffff"],
      primary: ["#3b82f6", "#60a5fa"],
      "primary-foreground": ["#ffffff", "#1e293b"],
      secondary: ["#f1f5f9", "#334155"],
      "secondary-foreground": ["#0f172a", "#f8fafc"],
      muted: ["#f8fafc", "#1e293b"],
      "muted-foreground": ["#64748b", "#94a3b8"],
      accent: ["#f1f5f9", "#334155"],
      "accent-foreground": ["#0f172a", "#f8fafc"],
      destructive: ["#ef4444", "#f87171"],
      "destructive-foreground": ["#ffffff", "#1e293b"],
      border: ["#e2e8f0", "#475569"],
      input: ["#e2e8f0", "#475569"],
      ring: ["#3b82f6", "#60a5fa"],
      card: ["#ffffff", "#0f172a"],
      "card-foreground": ["#000000", "#f8fafc"],
      popover: ["#ffffff", "#0f172a"],
      "popover-foreground": ["#000000", "#f8fafc"],
    } as any,
  };
};

/**
 * Helper function to escape regex special characters
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Additional utility function to validate the parsed result
 */
export const validateChaiThemeValues = (theme: ChaiTheme): boolean => {
  const requiredColorKeys = ["background", "foreground", "primary", "primary-foreground"];

  const hasRequiredColors = requiredColorKeys.every(
    (key) =>
      theme.colors[key as keyof typeof theme.colors] &&
      Array.isArray(theme.colors[key as keyof typeof theme.colors]) &&
      (theme.colors[key as keyof typeof theme.colors] || []).length >= 2,
  );

  return hasRequiredColors && !!theme.fontFamily.heading && !!theme.fontFamily.body && !!theme.borderRadius;
};

/**
 * Basic CSS validation function with improved error handling
 */
export const validateCssInput = (cssText: string): { isValid: boolean; error?: string } => {
  if (!cssText || typeof cssText !== "string") {
    return { isValid: false, error: "Please enter valid CSS content" };
  }

  const trimmedCss = cssText.trim();
  if (!trimmedCss) {
    return { isValid: false, error: "Please enter CSS content" };
  }

  try {
    // Check for basic CSS structure
    if (!trimmedCss.includes("{") || !trimmedCss.includes("}")) {
      return {
        isValid: false,
        error: "Invalid CSS format. CSS should contain proper block structure with { }",
      };
    }

    // Check for unmatched braces
    const openBraces = (trimmedCss.match(/{/g) || []).length;
    const closeBraces = (trimmedCss.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      return {
        isValid: false,
        error: "Invalid CSS format. Unmatched braces detected",
      };
    }

    // Check if the CSS contains some expected variable definitions
    if (!trimmedCss.includes("--") || !trimmedCss.includes(":")) {
      return {
        isValid: false,
        error: "Invalid CSS format. CSS should contain variable definitions like --primary: #color",
      };
    }

    // Check for at least one valid CSS selector (:root or .dark)
    if (!trimmedCss.includes(":root") && !trimmedCss.includes(".dark")) {
      return {
        isValid: false,
        error: "CSS should contain at least :root or .dark selector with theme variables",
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error("CSS validation error:", error);
    return {
      isValid: false,
      error: "Failed to parse CSS. Please check your syntax.",
    };
  }
};
