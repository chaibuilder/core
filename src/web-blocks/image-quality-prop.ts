/**
 * Shared "Image quality" settings-panel field for blocks that expose Vercel/
 * next-image optimization control.
 *
 * This is a pure JSON-schema fragment with no Next.js coupling, so it is safe on
 * the portable SDK side. The string `const` values mirror `resolveImageQuality`
 * in `components/ui/image-quality.ts`, which turns them into next/image props.
 *
 * Twin of staging's `sdk/web-blocks/image-quality-prop.ts` (the app-side
 * image-optimization control ports its consumers to `~/web-blocks/*`).
 */

type ImageQualityProp = {
  type: "string";
  title: string;
  description: string;
  default: string;
  oneOf: { const: string; title: string }[];
};

const buildImageQualityProp = (defaultValue: string): ImageQualityProp => ({
  type: "string",
  title: "Image quality",
  // Default (65) is what makes banners with small text look pixelated (#4670).
  description: "Default suits photos. Pick High for banners or any image with text on it: Default blurs small text.",
  default: defaultValue,
  oneOf: [
    // The stored value stays 'auto'; the resolver maps it to AUTO_IMAGE_QUALITY
    // (components/ui/image-quality.ts). Only the label spells out the number.
    { const: "auto", title: "Default (65)" },
    { const: "max", title: "Maximum (100)" },
    { const: "high", title: "High (85)" },
    { const: "balanced", title: "Balanced (65)" },
    { const: "low", title: "Low (50)" },
    { const: "raw", title: "Off — serve original" },
  ],
});

/**
 * For the Image block: images already flow through next/image, so Auto
 * (optimized at AUTO_IMAGE_QUALITY, 65) is the default.
 */
export const imageQualityProp = buildImageQualityProp("auto");

/**
 * For background images (Box/EmptyBox): these render as a raw CSS
 * `background-image` today, so the default is Off — optimization is strictly
 * opt-in and existing pages are unchanged.
 */
export const backgroundImageQualityProp = buildImageQualityProp("raw");
