---
title: Block Component Props
impact: HIGH
tags: blocks, ChaiBlockComponentProps, blockProps, styles, inBuilder, children
---

## Block Component Props

Every block component receives `ChaiBlockComponentProps<T>` — your own props merged with ChaiBuilder runtime-injected props.

**Type signature:**

```tsx
import type { ChaiBlockComponentProps, ChaiStyles } from "@chaibuilder/core/types";

type MyBlockProps = {
  title: string;
  styles: ChaiStyles; // always ChaiStyles for the styles prop
};

const MyBlock = (props: ChaiBlockComponentProps<MyBlockProps>) => {
  const {
    // Your props
    title,
    styles,

    // Runtime injected — always available
    blockProps, // Record<string, string> — spread onto the root DOM element
    inBuilder, // boolean — true when rendered inside the editor
    lang, // string — current language code
    draft, // boolean — true in preview/draft mode
    children, // ReactNode — child blocks (if wrapper: true)
    pageProps, // ChaiPageProps — slug, searchParams
    pageData, // any — resolved page data
    $loading, // boolean — true while dataProvider is fetching
  } = props;

  return (
    <div {...blockProps} {...styles}>
      {title}
    </div>
  );
};
```

**Correct — use `blockProps` + spread `styles`:**

```tsx
const Component = ({ blockProps, styles, label }: ChaiBlockComponentProps<{ label: string; styles: ChaiStyles }>) => (
  <button {...blockProps} {...styles}>
    {label}
  </button>
);
```

**Incorrect — spreading all props onto DOM element:**

```tsx
// ❌ passes internal ChaiBuilder props (_id, _type, inBuilder, etc.) to the DOM
const Component = (props: ChaiBlockComponentProps<MyProps>) => <div {...props}>{props.title}</div>;
```

**Rules:**

- Always spread `blockProps` on the **root DOM element** — it carries `data-block-id` and other builder attrs
- Always spread `styles` on the **root DOM element** — it carries Tailwind class strings
- Use `inBuilder` to conditionally render editor-only chrome (tooltips, placeholders)
- Use `$loading` to show a skeleton when `dataProvider` is fetching
- `children` is only populated when `wrapper: true` is set in config — always render it for container blocks
