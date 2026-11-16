import * as React from "react";
import { registerChaiBlockProps, stylesProp } from "~/registry";
import { ChaiBlockComponentProps, ChaiBlockConfig, ChaiStyles } from "~/types/blocks";
import EmptySlot from "~/web-blocks/empty-slot";
import { backgroundImageQualityProp } from "~/web-blocks/image-quality-prop";

export type BoxProps = {
  tag: string;
  backgroundImage: string;
  imageQuality?: string;
  styles: ChaiStyles;
};

const Component = (props: ChaiBlockComponentProps<BoxProps>) => {
  const { blockProps, inBuilder, backgroundImage, children, tag = "div", styles } = props;
  let nestedChildren = children;
  if (!children) {
    nestedChildren = <EmptySlot inBuilder={inBuilder} />;
  }

  // Only emit `style` when there is a background image: an always-present
  // `style: {}` is serialised into the RSC flight payload for every Box.
  const style = backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined;
  // `styles` carries the authored `styles_attrs`, which can include a `style`
  // string; it was always overridden here and React rejects string styles.
  const { style: _authored, ...styleAttrs } = (styles ?? {}) as Record<string, unknown>;

  return React.createElement(tag, { ...blockProps, ...styleAttrs, ...(style ? { style } : {}) }, nestedChildren);
};

const Config: ChaiBlockConfig = {
  type: "Box",
  description: "Similar to a div or section elements in HTML",
  label: "Box",
  category: "core",
  group: "basic",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
      tag: {
        type: "string",
        default: "div",
        title: "Tag",
        oneOf: [
          { const: "div", title: "div" },
          { const: "header", title: "header" },
          { const: "footer", title: "footer" },
          { const: "section", title: "section" },
          { const: "article", title: "article" },
          { const: "aside", title: "aside" },
          { const: "main", title: "main" },
          { const: "nav", title: "nav" },
          { const: "figure", title: "figure" },
          { const: "details", title: "details" },
          { const: "summary", title: "summary" },
          { const: "dialog", title: "dialog" },
          { const: "strike", title: "strike" },
          { const: "caption", title: "caption" },
          { const: "legend", title: "legend" },
          { const: "figcaption", title: "figcaption" },
          { const: "mark", title: "mark" },
        ],
      },
      backgroundImage: {
        type: "string",
        default: "",
        title: "Background Image",
        ui: { "ui:widget": "image", "ui:allowEmpty": true },
      },
      // Optimization for the background image. Default is "raw" (unchanged), so
      // it is opt-in. The app-side render override (blocks/rsc/Box.tsx) applies
      // it via resolveBackgroundImageUrl; the editor preview stays raw.
      imageQuality: backgroundImageQualityProp,
    },
  }),
  canAcceptBlock: () => true,
};

export { Component, Config };
