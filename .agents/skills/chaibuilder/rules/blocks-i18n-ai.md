---
title: i18n, AI, and Inline Edit Props
impact: MEDIUM
tags: blocks, i18nProps, aiProps, inlineEditProps, closestBlockProp
---

## i18n, AI, and Inline Edit Props

Declare which props participate in translation, AI generation, and inline editing using `i18nProps`, `aiProps`, and `inlineEditProps` in the block config.

**Correct:**

```ts
const BannerConfig: ChaiBlockConfig = {
  type: "Banner",
  label: "Banner",
  group: "marketing",
  props: registerChaiBlockProps({ ... }),

  i18nProps: ["title", "subtitle", "ctaLabel"],   // translatable props
  aiProps: ["title", "subtitle"],                  // AI can generate/suggest values
  inlineEditProps: ["title", "subtitle"],          // double-click to edit in canvas
};
```

**`closestBlockProp` — read a prop from the nearest ancestor block:**

```ts
import { closestBlockProp } from "@chaibuilder/core/registry";

// In block config props — reads "lang" from the nearest "Repeater" ancestor
const props = registerChaiBlockProps({
  properties: {
    repeaterLang: closestBlockProp("Repeater", "lang"),
    styles: stylesProp(""),
  },
});
```

**Rules:**

- `i18nProps` — only list props whose values differ per language (strings, rich text)
- `aiProps` — only list props the AI should write to (strings, not styles or IDs)
- `inlineEditProps` — props that show an inline text editor when the block is double-clicked on canvas
- `closestBlockProp(blockType, prop)` — creates a runtime-only prop that reads from the nearest ancestor of `blockType`; never appears in settings UI
