---
title: Global Data Provider, Page Types, and Collections
impact: HIGH
tags: server, globalDataProvider, pageTypes, collections, blockDataProviders
---

## Global Data Provider, Page Types, and Collections

Three complementary server-side data hooks for injecting data into pages.

> Repeater block data sources (the deprecated `collections`/`repeaterData` and their replacement `chaiCollections`) are covered in server-repeater-data.md.

---

### `globalDataProvider` — site-wide data merged into every render

```ts
buildChaiBuilderConfig({
  db,
  globalDataProvider: async ({ lang, draft, inBuilder }) => {
    // Returned object is merged into pageData for every page
    return {
      nav: await fetchNavigation({ lang, draft }),
      siteName: "My Site",
      footerLinks: await fetchFooterLinks({ lang }),
    };
  },
});
```

- Runs on every page render
- Result is merged shallowly into `pageData`
- Keep it fast — it blocks every render

---

### `pageTypes` — per-page-type data providers

```ts
import type { ChaiPageTypeEntry } from "@chaibuilder/core/server";

const blogPostPageType: ChaiPageTypeEntry = {
  type: "blog-post", // matches page._pageType in the DB
  label: "Blog Post",
  dataProvider: async ({ lang, draft, inBuilder, pageProps }) => {
    const slug = pageProps.slug;
    return { post: await fetchPost(slug, { lang, draft }) };
  },
};

buildChaiBuilderConfig({ db, pageTypes: [blogPostPageType] });
```

- Only runs for pages whose `_pageType` matches
- Result is deep-merged on top of `globalDataProvider` output

---

### `blockDataProviders` — per-block-type server data

```ts
buildChaiBuilderConfig({
  db,
  blockDataProviders: {
    // Key = block type string
    ProductCard: async ({ block, lang, draft, inBuilder, pageProps }) => {
      return fetchProduct(block.productId, { lang, draft });
    },
    RelatedPosts: async ({ block, lang }) => {
      return { posts: await fetchRelatedPosts(block.category, { lang }) };
    },
  },
});
```

- Runs on every render for each block of that type
- Result is merged into the block's `pageData` prop

---

**Rules:**

- `globalDataProvider` → every page; `pageTypes[].dataProvider` → matching page type only; `blockDataProviders` → per block instance
- All three are async and run server-side only
- Keep providers lean — they are not cached by default
- `inBuilder: true` when called from the editor — use to return mock or simplified data
