---
title: Server Config — buildChaiBuilderConfig
impact: HIGH
tags: server, buildChaiBuilderConfig, ChaiBuilderServerConfigInput, db, pageTypes, collections
---

## Server Config — buildChaiBuilderConfig

Use `buildChaiBuilderConfig` to create the frozen server config object. Pass it to every `getChaiBuilder` call. Registers the DB, block data providers, and actions at init time.

**Correct:**

```ts
// chaibuilder.config.ts (server-only, imported in route handlers / pages)
import "server-only";
import { buildChaiBuilderConfig } from "@chaibuilder/core/server";

export const chaiConfig = buildChaiBuilderConfig({
  db,                         // required — result of createSQLiteDB(), createPostgresDB(), etc.

  globalDataProvider: async ({ lang, draft, inBuilder }) => {
    return { siteName: "My Site", nav: await fetchNav({ lang, draft }) };
  },

  pageTypes: [
    { type: "blog-post", label: "Blog Post", dataProvider: blogPostDataProvider },
  ],

  chaiCollections: [
    // Repeater block data sources with declarative filter/sort/limit —
    // see server-repeater-data.md. (Replaces the deprecated `collections`
    // and `repeaterData`.)
    { id: "blog-posts", name: "Blog Posts", fields: [...], fetch: async ({ query }) => ({ items: [] }) },
  ],

  blockDataProviders: {
    ProductCard: async ({ block, lang, draft }) => fetchProduct(block.productId, { lang, draft }),
  },

  actions: {
    CHECK_USER_ACCESS: new CheckUserAccessAction(),
    SAVE_PAGE:         new SavePageAction(),
  },

  debugLevel: 0,   // 0 = off | 1 = DB + HTTP + cache + AI summary | 2 = full timing + SQL + AI verbose
});
```

**With `onInit` and `extend`:**

```ts
export const chaiConfig = buildChaiBuilderConfig(
  { db, globalDataProvider, pageTypes },
  {
    onInit: async (config) => {
      // Runs once on first getChaiBuilder call — good for migrations, seeding
      await runMigrations();
    },
    extend: {
      myCustomValue: "hello", // accessible via config.myCustomValue
    },
  },
);
```

**`ChaiBuilderServerConfigInput` shape:**

| Field                | Type                                    | Required | Description                                                                             |
| -------------------- | --------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `db`                 | `ChaiDbConfigInput`                     | ✅       | Database connection                                                                     |
| `globalDataProvider` | `ChaiGlobalDataProvider`                | —        | Data merged into every page render                                                      |
| `pageTypes`          | `ChaiPageTypeEntry[]`                   | —        | Custom page type configs                                                                |
| `chaiCollections`    | `ChaiRepeaterDataEntry[]`               | —        | Collection data sources (typed filters/sort/limit — see server-repeater-data.md)        |
| `repeaterData`       | `ChaiRepeaterDataEntry[]`               | —        | Deprecated — use `chaiCollections` (merged into it at resolve time)                     |
| `collections`        | `ChaiCollectionEntry[]`                 | —        | Deprecated — use `chaiCollections`                                                      |
| `blockDataProviders` | `Record<string, ChaiBlockDataProvider>` | —        | Per-block server data providers                                                         |
| `actions`            | `Record<string, ChaiAction>`            | —        | Custom server actions                                                                   |
| `ai`                 | `Partial<ResolvedChaiAIGlobalConfig>`   | —        | AI model config                                                                         |
| `extraPermissions`   | `string[]`                              | —        | Additional permission keys                                                              |
| `roles`              | `ChaiRolesConfig`                       | —        | `undefined` = built-in defaults                                                         |
| `debugLevel`         | `0 \| 1 \| 2`                           | —        | Server-side debug verbosity (1 = DB/HTTP/cache/AI summary; 2 = + timing/SQL/AI verbose) |

**Rules:**

- `buildChaiBuilderConfig` is server-only — never import in client components
- The returned config is `Object.freeze`d — do not mutate it
- Call once per process (typically in `chaibuilder.config.ts`) — pass the same object everywhere
- `onInit` runs exactly once, on the first `getChaiBuilder` call in the process
