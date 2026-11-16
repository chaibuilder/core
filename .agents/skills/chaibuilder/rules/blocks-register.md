---
title: Register a Custom Block
impact: HIGH
tags: blocks, registerChaiBlock, ChaiBlockConfig, ChaiBlockComponentProps
---

## Register a Custom Block

A block has two parts: a **React component** and a **Config object**. Register both with `registerChaiBlock`.

**Correct:**

```tsx
import { registerChaiBlock } from "@chaibuilder/core/registry";
import { registerChaiBlockProps, stylesProp } from "@chaibuilder/core/registry";
import type { ChaiBlockComponentProps, ChaiBlockConfig, ChaiStyles } from "@chaibuilder/core/types";

// 1. Type your block's own props
type AlertProps = {
  message: string;
  variant: "info" | "warning" | "error";
  styles: ChaiStyles;
};

// 2. React component — receives block props + runtime injected props
const AlertComponent = (props: ChaiBlockComponentProps<AlertProps>) => {
  const { blockProps, styles, message, variant } = props;
  return (
    <div {...blockProps} {...styles} data-variant={variant}>
      {message}
    </div>
  );
};

// 3. Config
const AlertConfig: ChaiBlockConfig = {
  type: "Alert", // unique string key — no spaces
  label: "Alert", // shown in the builder UI
  group: "basic", // groups in the "Add Block" panel
  category: "core", // optional, defaults to "core"
  description: "An alert box for messages",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("rounded-md p-4 bg-blue-50"),
      message: {
        type: "string",
        title: "Message",
        default: "Alert message here",
      },
      variant: {
        type: "string",
        title: "Variant",
        default: "info",
        enum: ["info", "warning", "error"],
      },
    },
  }),
  i18nProps: ["message"],
  aiProps: ["message"],
};

// 4. Register
registerChaiBlock(AlertComponent, AlertConfig);
```

**Rules:**

- `type` must be unique across all registered blocks — use PascalCase (e.g. `"MyAlert"`)
- `group` controls which panel group the block appears under in "Add Block"
- `props` must use `registerChaiBlockProps(schema)` — not a raw schema object
- Never spread `...props` onto DOM elements — use `blockProps` for data/aria attrs and spread `styles` separately
- Call `registerChaiBlock` at module level, before the builder mounts
- Both `registerChaiBlock` and `registerChaiBlockProps` import from `@chaibuilder/core/registry`
