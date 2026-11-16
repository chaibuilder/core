---
title: Custom Block Library
impact: MEDIUM
tags: extend-ui, library, registerChaiLibrary
---

## Custom Block Library

Use `registerChaiLibrary` to register a source of blocks that users can browse and insert from the builder.

**Correct:**

```ts
import { registerChaiLibrary } from "@chaibuilder/core";

registerChaiLibrary("my-library", {
  name: "My Components",
  description: "Company design system blocks",

  getBlocksList: async (library) => {
    const blocks = await fetchMyBlocks();
    return blocks.map((b) => ({
      id: b.id,
      name: b.name,
      preview: b.previewUrl, // optional thumbnail
    }));
  },

  getBlock: async ({ library, block }) => {
    // Return an HTML string OR a ChaiBlock[] array
    const html = await fetchBlockHtml(block.id);
    return html;
  },
});
```

**Rules:**

- `getBlocksList` — async, returns list of available blocks (shown in library panel)
- `getBlock` — async, returns the actual block content as an HTML string or `ChaiBlock[]`
- Registering the same `id` twice silently overrides the previous library
