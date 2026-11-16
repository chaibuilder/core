---
title: Repeater Data Sources
impact: HIGH
tags: repeater-data, collections, filters, sorting, payload
---

## Repeater Data Sources

Register array data sources for the Repeater block via `chaiCollections` in the server config. A definition declares typed filterable/sortable **fields**; the builder renders an adaptive filter UI (field / operator / value rows, multi-sort, limit) from them, and `fetch` receives a validated structured `query`. Replaces the deprecated `collections` API (opaque `filters`/`sort` id lists that core never interpreted). `repeaterData` is the previous name for this key — still accepted, merged into `chaiCollections` at resolve time.

**Incorrect:**

```ts
// Deprecated collections API — filter/sort ids are opaque, fetch must decode
// block.filter itself, limit never reaches the query
collections: [{
  id: "blog",
  name: "Blogs",
  filters: [{ id: "featured", name: "Featured" }],
  fetch: async ({ block }) => {
    const items = await getPosts();
    return { items: block.filter === "featured" ? items.filter((p) => p.featured) : items };
  },
}],
```

**Correct:**

```ts
import { applyRepeaterQuery } from "@chaibuilder/core/utils";
import type { ChaiRepeaterDataConfig } from "@chaibuilder/core/types";

const blog: ChaiRepeaterDataConfig = {
  id: "blog",
  name: "Blog Posts",
  fields: [
    { id: "title", label: "Title", type: "text" },
    { id: "category", label: "Category", type: "select", options: [{ label: "News", value: "news" }] },
    { id: "featured", label: "Featured", type: "boolean" },
    { id: "publishedAt", label: "Published At", type: "date", filterable: false }, // sort-only
    { id: "slug", label: "Slug", type: "text" },
  ],
  defaultSort: [{ field: "publishedAt", direction: "desc" }],
  defaultLimit: 12, // used when the block sets no limit; default 10
  maxLimit: 50,     // hard clamp; default 100
  // query = { filters, sort, limit } — validated, $page.* tokens resolved
  fetch: async ({ query, lang }) => {
    const all = await getPosts(lang);
    return { items: applyRepeaterQuery(all, query), totalItems: all.length };
  },
};

// server config
chaiCollections: [blog],
```

Sources backed by a real database should translate `query` instead of using `applyRepeaterQuery`: `query.filters` is an AND-combined `Array<{ field, operator, value }>` (operators: `equals`, `not_equals`, `contains`, `greater_than`, `greater_than_equal`, `less_than`, `less_than_equal`, `in`, `not_in` — same ids as Payload's where operators), `query.sort` is `Array<{ field, direction }>`, `query.limit` is a number.

**Payload:** pass Payload collections to `chaiCollections` in the Payload-aware `buildChaiBuilderConfig` — fields are auto-derived from the collection schema and the query is translated to `payload.find` (where/sort/limit, `totalItems` from `totalDocs`):

```ts
chaiCollections: [
  Blog, // zero config — all supported fields derived (text/textarea/email/code, number, checkbox, date, select/radio + createdAt/updatedAt)
  {
    collection: Legal,
    include: ["title", "category", "publishedAt", "slug"], // preferred: only these fields, in this order
    fields: { title: { label: "Document Title" } },        // per-field override (label/type/filterable/sortable/options)
    defaultSort: [{ field: "updatedAt", direction: "desc" }],
    maxLimit: 20,
  },
  { collection: Docs, exclude: ["internalNotes"] }, // "everything except"; ignored when include is set
],
```

**Dynamic values:** filter values may be the tokens `$page.slug`, `$page.baseSlug`, `$page.lang` (exposed in the UI as "Current page slug" etc.). Core resolves them from page context before calling `fetch` — a related-posts repeater is `slug` / `is not` / `Current page slug`. A filter whose token resolves to nothing is dropped from the query.

**Rules:**

- `chaiCollections` and legacy `collections` share the `{{#<id>}}` binding namespace; a `chaiCollections` source with the same id shadows the legacy collection, so migrating `collections: [Blog]` to `chaiCollections: [Blog]` needs no stored-page changes.
- `fetch` receives already-validated input: unknown fields, invalid operators, and un-coercible values are dropped; `limit` is clamped to `maxLimit`. Never trust `block.filters` directly — read `query`.
- Filters are AND-combined (v1). Express a range as two rows on the same field.
- In the builder preview, `$page.slug` equals the page's base slug (templates have no concrete entry), so "exclude current post" only fully applies on the live page.
- richText, upload, relationship, array, blocks, group and tabs Payload fields are skipped during derivation — force one in via `fields: { author: { type: "text", label: "Author Id" } }` if you know its shape.
- `collections`, `CollectionConfig`, `payloadCollection`, `getConfigCollection(s)` and `cb.getCollection(s)` are deprecated but still functional.
- `repeaterData` (config key), `getConfigRepeaterData(Source)` and `cb.getRepeaterData(Source)` are deprecated aliases of `chaiCollections`, `getConfigChaiCollection(s)` and `cb.getChaiCollection(s)`.

**Opt-in / migration:** a host that never sets `chaiCollections` (or the deprecated `repeaterData`) behaves exactly as before — the legacy collection path, its `fetch` result (extra keys included) and the Repeater block's stored props are all untouched, and `filters`/`sortBy` have no schema default so they are never written into existing blocks. Moving a source from `collections` to `chaiCollections` is the opt-in, and it changes three things for pages already using it:

| On migrating a source                  | Before (`collections`)                   | After (`chaiCollections`)                                                                                                        |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Block's legacy `filter` / `sort` props | passed to `fetch`, decoded by the source | not part of `query` — re-create them as filter/sort rows (core logs a one-time warning per block; the raw props stay on `block`) |
| `limit`                                | source decided                           | `query.limit` = block limit, else `defaultLimit` (10), clamped to `maxLimit` (100)                                               |
| `totalItems` (Payload)                 | count of returned docs                   | `totalDocs` — total matches, so pagination shows real page counts                                                                |
