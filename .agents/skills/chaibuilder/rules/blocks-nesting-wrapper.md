---
title: Nesting and Wrapper Blocks
impact: MEDIUM
tags: blocks, wrapper, canAcceptBlock, canBeNested, children
---

## Nesting and Wrapper Blocks

To make a block a container that can hold child blocks, set `wrapper: true` in config and render `children` in the component.

**Correct — container block:**

```tsx
import type { ChaiBlockComponentProps, ChaiBlockConfig, ChaiStyles } from "@chaibuilder/core/types";
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "@chaibuilder/core/registry";

type CardProps = { styles: ChaiStyles };

const CardComponent = ({ blockProps, styles, children }: ChaiBlockComponentProps<CardProps>) => (
  <div {...blockProps} {...styles}>
    {children} {/* ← renders child blocks */}
  </div>
);

const CardConfig: ChaiBlockConfig = {
  type: "Card",
  label: "Card",
  group: "layout",
  wrapper: true, // ← makes this a container
  props: registerChaiBlockProps({
    properties: { styles: stylesProp("rounded-lg border p-4") },
  }),
  canAcceptBlock: (type) => true, // ← which child block types are allowed
  canBeNested: (parentType) => true, // ← which parent types can contain this block
};

registerChaiBlock(CardComponent, CardConfig);
```

**Controlling nesting with type checks:**

```ts
canAcceptBlock: (childType) => ["Text", "Image", "Button"].includes(childType),
canBeNested: (parentType) => parentType === "Card" || parentType === "Box",
```

**Rules:**

- Set `wrapper: true` in config AND render `{children}` in the component — both are required
- If `wrapper` is omitted or false, `children` will always be `undefined`
- `canAcceptBlock(type)` returning `false` prevents that block type from being dropped inside
- `canBeNested(parentType)` returning `false` prevents this block from being dropped into that parent
- For unconditional containers (accept anything), use `canAcceptBlock: () => true`
