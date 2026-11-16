---
title: Block Data Provider
impact: MEDIUM
tags: blocks, dataProvider, registerChaiServerBlock, async, $loading
---

## Block Data Provider

Use `dataProvider` in config to fetch async data for a block. The resolved data is injected as extra props into the component at render time.

**Client-side data provider (in ChaiBlockConfig):**

```tsx
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "@chaibuilder/core/registry";
import type { ChaiBlockComponentProps, ChaiBlockConfig } from "@chaibuilder/core/types";

type ProductProps = { productId: string; styles: ChaiStyles };
type ProductData = { name: string; price: number };

const ProductComponent = (props: ChaiBlockComponentProps<ProductProps, ProductData>) => {
  const { blockProps, styles, $loading, pageData } = props;
  const { name, price } = pageData ?? {};

  if ($loading) return <div {...styles} className="h-20 animate-pulse bg-gray-100" />;

  return (
    <div {...blockProps} {...styles}>
      <h3>{name}</h3>
      <p>${price}</p>
    </div>
  );
};

const ProductConfig: ChaiBlockConfig = {
  type: "ProductCard",
  label: "Product Card",
  group: "ecommerce",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("p-4 border rounded"),
      productId: { type: "string", title: "Product ID", default: "" },
    },
  }),
  dataProvider: async ({ block, lang, draft }) => {
    const data = await fetchProduct(block.productId, { lang, draft });
    return data; // merged into component props as pageData
  },
  dataProviderMode: "live", // "live" (always fetch) | "mock" (use mock in builder)
  dataProviderDependencies: ["productId"], // re-fetch when these props change
};

registerChaiBlock(ProductComponent, ProductConfig);
```

**Server-side data provider with `registerChaiServerBlock`:**

```tsx
import { registerChaiServerBlock } from "@chaibuilder/core/registry";

// Register only the server-side data provider for an already-registered block
registerChaiServerBlock(ProductComponent, {
  type: "ProductCard",
  dataProvider: async ({ block, lang, draft }) => {
    return fetchProduct(block.productId, { lang, draft });
  },
});
```

**Rules:**

- `dataProvider` runs on every render — keep it fast or cache results
- `dataProviderDependencies` is an array of prop keys; data re-fetches when those values change
- `dataProviderMode: "live"` → runs in both builder and render; `"mock"` → uses mock data in builder
- `$loading` is `true` while the data provider is fetching — always handle loading state
- `registerChaiServerBlock` is for attaching/overriding the server data provider only — it won't re-register the config
- Second generic on `ChaiBlockComponentProps<BlockProps, DataType>` types the `pageData` field
