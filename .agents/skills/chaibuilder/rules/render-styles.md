---
title: Styles Utilities — getStylesForBlocks and Theme Helpers
impact: MEDIUM
tags: render, getStylesForBlocks, getChaiThemeCssVariables, ChaiDesignTokens
---

## Styles Utilities

Low-level utilities for generating Tailwind CSS and theme CSS variables outside the standard render path (e.g. for emails, exports, static generation).

---

### `getStylesForBlocks` — generate Tailwind CSS for a block array

```ts
import { getStylesForBlocks } from "@chaibuilder/core/render";
import type { ChaiBlock } from "@chaibuilder/core/types";

const blocks: ChaiBlock[] = [...];

// Without Tailwind preflight (default — for embedding in existing pages)
const css = await getStylesForBlocks(blocks);

// With preflight (for standalone pages with no base stylesheet)
const cssWithBase = await getStylesForBlocks(blocks, true);
```

**Use cases:**

- Generating CSS for email templates
- Exporting static HTML + CSS snapshots
- Custom SSR pipelines that don't use `ChaiPageCSS`

**Rules:**

- Async — uses a Tailwind JIT compiler under the hood; keep calls cached where possible
- `includeBaseStyles: true` adds CSS preflight (box-sizing, margin resets, etc.)
- `ChaiPageCSS` already calls this internally — only use directly for custom pipelines

---

### `getChaiThemeCssVariables` — CSS variables from a theme object

```ts
import { getChaiThemeCssVariables } from "@chaibuilder/core/render";

const cssVars = await getChaiThemeCssVariables({ theme: siteSettings.theme });
// Returns a CSS string like: ":root { --color-primary: #...; ... }"
```

**Rules:**

- Returns a raw CSS string — inject via `<style dangerouslySetInnerHTML={{ __html: cssVars }} />`
- Used internally by `ChaiPageCSS` — call directly only in custom render pipelines

---

### `PreviewBanner` — draft mode indicator

```tsx
import { PreviewBanner } from "@chaibuilder/core/render";

// Show a fixed banner when draft mode is active
<PreviewBanner show={isDraft} disableUrl="/api/exit-preview" />;
```

| Prop         | Type      | Default              | Description                    |
| ------------ | --------- | -------------------- | ------------------------------ |
| `show`       | `boolean` | —                    | Whether to render the banner   |
| `disableUrl` | `string`  | `/next/exit-preview` | URL to call to exit draft mode |

- Client component (`"use client"`) — safe to use in RSC trees
- Renders a fixed bottom-left animated pill; clicking "Disable" calls `disableUrl` and reloads
