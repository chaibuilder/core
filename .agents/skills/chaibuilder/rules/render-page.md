---
title: Render a ChaiBuilder Page
impact: HIGH
tags: render, RenderChaiBlocks, ChaiPageCSS, getPagePayload, page
---

## Render a ChaiBuilder Page

Use `RenderChaiBlocks` to render a page's blocks and `ChaiPageCSS` to inject the page's Tailwind CSS + theme variables in the `<head>`.

**Correct — full page component:**

```tsx
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";
import { ChaiPageCSS, ChaiPageJSONLD, RenderChaiBlocks } from "@chaibuilder/core/render";
import { PreviewBanner } from "@chaibuilder/core/render";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
  const params = await props.params;
  const slug = "/" + (params.slug?.join("/") ?? "");

  const cb = await getChaiBuilder(props);
  const payload = await cb.getPagePayload(slug);

  if (!payload) return <div>Page not found</div>;

  const { page, pageData, settings } = payload;

  return (
    <>
      <RenderChaiBlocks page={page} pageData={pageData} settings={settings} pageProps={{ slug }} />
      <PreviewBanner show={page.draft ?? false} />
    </>
  );
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const slug = "/" + (params.slug?.join("/") ?? "");
  const cb = await getChaiBuilder(props);
  return cb.generateMetaData(slug);
}
```

**`ChaiPageCSS` — place in the layout `<head>`:**

```tsx
// app/(public)/layout.tsx
import { getChaiBuilder } from "@/chaibuilder.server";
import { ChaiPageCSS } from "@chaibuilder/core/render";

export default async function Layout({ children, params }) {
  const cb = await getChaiBuilder();
  const payload = await cb.getPagePayload(slug);

  return (
    <html>
      <head>
        <ChaiPageCSS page={payload.page} />
        <ChaiPageJSONLD page={payload.page} pageData={payload.pageData} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**`RenderChaiBlocks` props:**

| Prop              | Type                  | Required | Description                         |
| ----------------- | --------------------- | -------- | ----------------------------------- |
| `page`            | `ChaiFullPage`        | ✅       | Page record from `getPagePayload`   |
| `pageData`        | `Record<string, any>` | ✅       | Resolved data from data providers   |
| `settings`        | `Record<string, any>` | ✅       | Site settings from `getPagePayload` |
| `pageProps`       | `ChaiPageProps`       | ✅       | `{ slug, searchParams }`            |
| `linkComponent`   | `ComponentType`       | —        | Custom Next.js `<Link>` override    |
| `imageComponent`  | `ComponentType`       | —        | Custom Next.js `<Image>` override   |
| `buttonComponent` | `ComponentType`       | —        | Custom button override              |
| `designTokens`    | `ChaiDesignTokens`    | —        | Override design tokens              |

**Rules:**

- `RenderChaiBlocks` is an async RSC — do not render it in a `"use client"` component
- `ChaiPageCSS` must be in `<head>` — renders `<style>` tags for Tailwind + theme CSS variables + fonts
- Always get `page`, `pageData`, `settings` from `cb.getPagePayload(slug)` — do not construct them manually
- `ChaiPageJSONLD` renders structured data JSON-LD — place in `<head>` next to `ChaiPageCSS`
