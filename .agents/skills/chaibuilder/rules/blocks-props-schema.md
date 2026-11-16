---
title: Block Props Schema
impact: HIGH
tags: blocks, registerChaiBlockProps, stylesProp, builderProp, schema
---

## Block Props Schema

Use `registerChaiBlockProps(schema)` to define the editable props for a block. It processes the schema, extracts `uiSchema` from `ui` keys, and returns the RJSF-compatible `{ schema, uiSchema }` object expected by `ChaiBlockConfig.props`.

**Correct:**

```ts
import { registerChaiBlockProps, stylesProp, builderProp } from "@chaibuilder/core/registry";

const props = registerChaiBlockProps({
  properties: {
    // Tailwind styles prop — always use stylesProp() for the styles property
    styles: stylesProp("rounded-lg p-4 bg-white shadow"),

    // Basic string
    title: {
      type: "string",
      title: "Title",
      default: "Card Title",
    },

    // Enum with display names
    size: {
      type: "string",
      title: "Size",
      default: "md",
      enum: ["sm", "md", "lg"],
      enumNames: ["Small", "Medium", "Large"],
    },

    // Boolean toggle
    showBorder: {
      type: "boolean",
      title: "Show border",
      default: true,
    },

    // Nested object with custom field
    link: {
      type: "object",
      title: "Link",
      properties: {
        href: { type: "string" },
        target: { type: "string" },
      },
      default: { href: "", target: "_self" },
      ui: { "ui:field": "link" },
    },

    // Builder-only prop (hidden in rendered output, shown in editor)
    editorNote: builderProp({
      type: "string",
      title: "Editor note",
      default: "",
    }),
  },
});
```

**`stylesProp(defaultClasses)`** — creates a styles property with correct defaults:

```ts
styles: stylesProp("flex items-center gap-2");
// Equivalent to: { type: "string", styles: true, default: "dt#,flex items-center gap-2", ui: { "ui:widget": "hidden" } }
```

**`builderProp(options)`** — marks a prop as builder-only; not rendered in the page output:

```ts
editorLabel: builderProp({ type: "string", title: "Editor label", default: "" });
```

**Rules:**

- Always pass the schema directly to `registerChaiBlockProps()` — never construct `{ schema, uiSchema }` manually
- Every block that uses Tailwind styling must include `styles: stylesProp(...)` — without it, styles cannot be edited in the builder
- The `ui` key on any property is automatically extracted to `uiSchema` by `registerChaiBlockProps`
- Reserved prop names that will throw: `_type`, `_id`, `_parent`, `_bindings`, `_name`
- Runtime-injected props that cannot be in schema: `$loading`, `blockProps`, `inBuilder`, `lang`, `draft`, `pageProps`, `pageData`, `children`
