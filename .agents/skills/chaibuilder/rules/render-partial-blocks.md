---
title: Partial Blocks and Custom Block Components
impact: MEDIUM
tags: render, getMergedPartialBlocks, linkComponent, imageComponent, buttonComponent
---

## Partial Blocks and Custom Block Components

---

### `getMergedPartialBlocks` — inline partial blocks before rendering

Partial blocks (`PartialBlock` / `GlobalBlock`) are placeholders that reference a shared block tree. Before rendering in a custom pipeline, merge them inline.

```ts
import { getMergedPartialBlocks } from "@chaibuilder/core/render";

// partials: Record<partialBlockId, ChaiBlock[]> — fetched from cb.getPartialBlocks()
const mergedBlocks = getMergedPartialBlocks(page.blocks, partials);
```

Nested partials resolve up to `MAX_PARTIAL_DEPTH` levels (2 by default: page → partial → partial). Self-references and cycles are left unexpanded, so hand-authored block trees can never cause an infinite loop. The input array is not mutated.

**When you need it:** Only in custom render pipelines that bypass `getPagePayload`. The standard `RenderChaiBlocks` path handles this automatically.

---

### Custom Link / Image / Button components

Override the built-in block renderers for `Link`, `Image`, and `Button` blocks with Next.js-optimised versions (or your own).

```tsx
import { RenderChaiBlocks } from "@chaibuilder/core/render";
import NextImage from "next/image";
import NextLink from "next/link";
import type { ChaiBlockComponentProps } from "@chaibuilder/core/types";

// Custom image using next/image
const MyImage = ({ styles, image, alt, width, height, blockProps }: ChaiBlockComponentProps<ImageProps>) => (
  <NextImage {...blockProps} {...styles} src={image} alt={alt} width={+width} height={+height} />
);

// Custom link using next/link
const MyLink = ({ styles, link, content, blockProps }: ChaiBlockComponentProps<LinkProps>) => (
  <NextLink {...blockProps} {...styles} href={link?.href ?? "/"} target={link?.target}>
    {content}
  </NextLink>
);

// Pass to RenderChaiBlocks
<RenderChaiBlocks
  page={page}
  pageData={pageData}
  settings={settings}
  pageProps={pageProps}
  imageComponent={MyImage}
  linkComponent={MyLink}
/>;
```

**Rules:**

- Custom components must accept `ChaiBlockComponentProps<T>` — spread `blockProps` and `styles` on the root element
- `imageComponent`, `linkComponent`, `buttonComponent` can also be `Promise<ComponentType>` (for dynamic imports)
- If not provided, ChaiBuilder uses its own built-in RSC versions
