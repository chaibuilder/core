import { FrameIcon } from "@radix-ui/react-icons";
import * as React from "react";
import { getPartialWrapperTag, PARTIAL_WRAPPER_TAGS } from "~/constants/PARTIAL_BLOCKS";
import { registerChaiBlockProps, stylesProp } from "~/registry";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";

export type PartialBlockProps = {
  partialBlockId: string;
  wrapperTag?: string;
  styles?: ChaiStyles;
};

const Component = (props: ChaiBlockComponentProps<PartialBlockProps>) => {
  const { blockProps, inBuilder, children, partialBlockId, styles } = props;
  if (inBuilder && !partialBlockId) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-y-1 rounded-lg bg-gray-100 py-4 dark:bg-gray-800"
        {...blockProps}>
        <h1>Partial Block - {partialBlockId}</h1>
        <p>Choose a block from the sidebar to add it to this page.</p>
      </div>
    );
  }
  const wrapperTag = getPartialWrapperTag(props);
  // On the live site a placement the merge could not expand (missing, trashed, cyclic or too
  // deep) has no children; a styled wrapper around nothing would show as a blank band.
  if (!wrapperTag || (!inBuilder && !children)) {
    return React.createElement("span", { ...blockProps }, children);
  }
  // Same as Box: authored `styles_attrs` can carry a `style` string, which React rejects.
  const { style: _authored, ...styleAttrs } = (styles ?? {}) as Record<string, unknown>;
  // The builder canvas keys its partial CSS off this marker so the wrapper's own classes win.
  const builderAttrs = inBuilder ? { "data-partial-wrapper": wrapperTag } : {};
  return React.createElement(wrapperTag, { ...blockProps, ...styleAttrs, ...builderAttrs }, children);
};

const Config = {
  type: "PartialBlock",
  description: "A partial block component. Partial blocks are global blocks that can be used in multiple pages.",
  label: "Partial Block",
  icon: FrameIcon,
  category: "core",
  group: "basic",
  hidden: true,
  props: registerChaiBlockProps({
    properties: {
      partialBlockId: {
        type: "string",
        title: "Partial Block",
        default: "",
        ui: { "ui:widget": "hidden" },
      },
      wrapperTag: {
        type: "string",
        title: "Wrapper",
        default: "none",
        oneOf: PARTIAL_WRAPPER_TAGS.map((tag) => ({ const: tag, title: tag === "none" ? "None" : tag })),
        ui: { "ui:help": "Wraps the block in an element on this page only. Style it from the Styling tab." },
      },
      styles: stylesProp(""),
    },
  }),
};

export { Component as PartialBlock, Config as PartialBlockConfig };
