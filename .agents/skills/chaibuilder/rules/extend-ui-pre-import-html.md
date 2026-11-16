---
title: Pre-Import HTML Hook
impact: LOW
tags: extend-ui, import, registerChaiPreImportHTMLHook
---

## Pre-Import HTML Hook

Use `registerChaiPreImportHTMLHook` to transform raw HTML before it's converted into ChaiBlocks (e.g., sanitize, inject attributes, or normalize markup).

**Correct:**

```ts
import { registerChaiPreImportHTMLHook } from "@chaibuilder/core";

registerChaiPreImportHTMLHook(async (html) => {
  const cleaned = await sanitizeHtml(html);
  return cleaned;
});
```

**Rules:**

- Singleton — only one hook; last call wins
- Must return the transformed HTML string
- Async functions are supported
