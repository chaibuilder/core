import { first, isArray } from "lodash-es";
import Image from "next/image";
import * as React from "react";
import { ChaiBlockComponentProps, ChaiBlockStyles } from "~/types";

export const ImageBlock = (
  props: ChaiBlockComponentProps<{
    height: string;
    width: string;
    alt: string;
    styles: ChaiBlockStyles;
    lazyLoading: boolean;
    image: string;
  }>,
): React.ReactElement | null => {
  const { image, styles, alt, height, width, lazyLoading } = props;

  // If width or height are missing/invalid, use fill mode
  const shouldUseFill = !width || !height || isNaN(parseInt(width)) || isNaN(parseInt(height));

  // Trim both ends: a binding authored with stray whitespace (`" {{logo}}"`)
  // keeps it, because the binding engine renders with autoTrim off. When the
  // binding resolves to nothing that leaves whitespace only, which is truthy —
  // render nothing rather than an empty `src`, which makes the browser refetch
  // the whole page.
  const src = (isArray(image) ? first(image) : image)?.trim();

  if (!src) return null;

  const imageElement = React.createElement(Image, {
    ...styles,
    src,
    alt: alt || "",
    priority: !lazyLoading,
    loading: lazyLoading ? "lazy" : "eager",
    fill: shouldUseFill,
    height: shouldUseFill ? undefined : parseInt(height),
    width: shouldUseFill ? undefined : parseInt(width),
    style: shouldUseFill ? { objectFit: "cover" } : undefined,
    // Bypass the Vercel/Next.js image optimizer: the file is served directly from the
    // origin. next/image is kept only for its layout/sizing behavior (fill, width/height,
    // loading), not for re-encoding, so no image ever routes through /_next/image.
    unoptimized: true,
  });

  if (shouldUseFill) {
    return React.createElement("div", { className: "relative flex w-full h-full" }, imageElement);
  }

  return imageElement;
};
