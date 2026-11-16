---
title: getChaiBuilder — Request-Scoped Instance
impact: HIGH
tags: server, getChaiBuilder, ChaiBuilderInstance, page, layout, route-handler
---

## getChaiBuilder — Request-Scoped Instance

`getChaiBuilder` returns a request-scoped instance with all server APIs bound to the current context. Always pass `routeProps` (the `{ params, searchParams }` from the page/layout) on the first call per request.

**In a page / layout:**

```ts
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";

export default async function Page(props: { params: Promise<{ slug: string[] }> }) {
  const cb = await getChaiBuilder(props);
  const payload = await cb.getPagePayload(slugFromParams(props));
  // payload: { blocks, siteSettings, pageData, styles, ... }
  return <RenderChaiBlocks {...payload} />;
}

export async function generateMetadata(props) {
  const cb = await getChaiBuilder(props);
  return cb.generateMetaData(slugFromParams(props));
}
```

**In a route handler (API route):**

```ts
// app/(builder)/api/chai/route.ts
import { getChaiBuilder } from "@/chaibuilder.server";
import { handleChaiActionRequest, type ChaiBuilderRouteProps } from "@chaibuilder/core/nextjs/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, props: ChaiBuilderRouteProps) {
  const cb = await getChaiBuilder(props, request);
  return handleChaiActionRequest(request, cb.handleHttpAction);
}
```

**Key instance methods:**

| Method                      | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `cb.getPagePayload(slug)`   | Full page payload for rendering                                 |
| `cb.getPage(slug)`          | Raw page record                                                 |
| `cb.getPages()`             | All pages                                                       |
| `cb.generateMetaData(slug)` | Next.js `Metadata` object                                       |
| `cb.handleHttpAction(body)` | Dispatch a builder action from a parsed `{ action, data }` body |
| `cb.getSiteSettings()`      | Site-wide settings                                              |
| `cb.getPageData(slug)`      | Resolved page data from data providers                          |
| `cb.getSiteGlobalData()`    | Result of `globalDataProvider`                                  |

**Rules:**

- Pass `routeProps` (the component `props`) on the **first** `getChaiBuilder` call in a request — subsequent calls within the same render can omit it and reuse the shared context
- `getChaiBuilder` is server-only — never call from client components
- The instance is request-scoped — do not cache or share across requests
- `handleHttpAction` is the only entry point for client→server action dispatch — use it in the `POST /api/chai` route
