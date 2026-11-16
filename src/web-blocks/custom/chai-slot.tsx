import { ScanBox } from "lucide-react";
import * as React from "react";
import { cn } from "~/builder/core/functions/common-functions";
import { registerChaiBlockProps, stylesProp } from "~/registry";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";

export type ChaiSlotProps = {
  styles: ChaiStyles;
  wrapper?: "none" | "div";
  placeholder?: React.ReactNode;
};

// Blue in the outline, so a slot stands apart from regular blocks.
const SlotIcon = ({ className, ...props }: React.ComponentProps<typeof ScanBox>) => (
  <ScanBox {...props} className={cn(className, "text-blue-500")} />
);

const Component = ({
  blockProps,
  children,
  inBuilder,
  styles,
  wrapper,
  placeholder,
}: ChaiBlockComponentProps<ChaiSlotProps>) => {
  const isDiv = wrapper === "div";
  // Only an empty slot differs from live: the builder needs something visible to drop into.
  if (inBuilder && placeholder) {
    return (
      <div
        {...blockProps}
        {...(isDiv ? styles : {})}
        className={cn(isDiv && styles?.className, "relative z-10")}>
        {placeholder}
      </div>
    );
  }
  if (isDiv) {
    return (
      <div {...blockProps} {...styles}>
        {children}
      </div>
    );
  }
  return <>{children}</>;
};

const Config = {
  type: "ChaiSlot",
  label: "Area",
  description: "A named area of its parent block. Add the area's content inside it.",
  icon: SlotIcon,
  category: "core",
  group: "basic",
  hidden: true,
  // The owner's `accept` rule is applied per instance by `canAcceptInto`.
  canAcceptBlock: () => true,
  canDelete: () => false,
  canMove: () => false,
  canDuplicate: () => false,
  props: registerChaiBlockProps({
    properties: {
      wrapper: {
        type: "string",
        title: "Wrapper",
        enum: ["none", "div"],
        enumNames: ["None", "Div"],
        default: "none",
      },
      styles: stylesProp(""),
    },
  }),
};

export { Component as ChaiSlot, Config as ChaiSlotConfig };

