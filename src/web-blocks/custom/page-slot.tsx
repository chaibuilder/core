import { LayoutIcon } from "@radix-ui/react-icons";
import * as React from "react";
import { registerChaiBlockProps } from "~/registry";
import { ChaiBlockComponentProps } from "~/types/blocks";

export type PageSlotProps = {
  /** Empty = default slot (`children`). Named = matched via `ChaiLayout slots={{ name: … }}`. */
  slotName: string;
};

const Component = (props: ChaiBlockComponentProps<PageSlotProps>) => {
  const { blockProps, inBuilder, slotName } = props;
  if (inBuilder) {
    const label = slotName?.trim() ? `Slot: ${slotName.trim()}` : "Default slot (children)";
    return (
      <div
        className="flex flex-col items-center justify-center gap-y-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 dark:border-gray-600 dark:bg-gray-800"
        {...blockProps}>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Page content renders here</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    );
  }
  // Runtime injection is handled by the blocks renderer via slot / slots props.
  return null;
};

const Config = {
  type: "PageSlot",
  description:
    "Marks where custom-coded route content renders inside a layout. Leave name empty for children; set a name to use WithChaiLayout slots={{ name: <Node /> }}.",
  label: "Page Slot",
  icon: LayoutIcon,
  category: "core",
  group: "basic",
  hidden: true,
  pageTypes: ["_layout"],
  props: registerChaiBlockProps({
    properties: {
      slotName: {
        type: "string",
        title: "Slot name",
        default: "",
        description: "Empty = default (children). Named slots inject via slots={{ name: <Component /> }}.",
      },
    },
  }),
};

export { Component as PageSlot, Config as PageSlotConfig };
