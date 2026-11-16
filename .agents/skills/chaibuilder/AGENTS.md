# ChaiBuilder Core — Extension Patterns

**Version 0.4.0**  
ChaiBuilder  
June 2026

> This document is for agents and LLMs generating or maintaining code that integrates with or extends ChaiBuilder Core. It covers all top-level extension APIs with correct/incorrect examples and key constraints.

---

## Table of Contents

1. [Extend Builder UI](#1-extend-builder-ui) — **HIGH**
   - 1.1 [Setup Pattern — Centralise Registrations](#11-setup-pattern--centralise-registrations)
   - 1.2 [Add a Custom Sidebar Panel](#12-add-a-custom-sidebar-panel)
   - 1.3 [Inject Components via Slots](#13-inject-components-via-slots)
   - 1.4 [Lifecycle Hooks](#14-lifecycle-hooks)
   - 1.5 [Feature Flags](#15-feature-flags)
   - 1.6 [Add Block Tab](#16-add-block-tab)
   - 1.7 [Custom Block Library](#17-custom-block-library)
   - 1.8 [Custom Block Setting Widgets, Fields, and Templates](#18-custom-block-setting-widgets-fields-and-templates)
   - 1.9 [Custom Save to Library Dialog](#19-custom-save-to-library-dialog)
   - 1.10 [Pre-Import HTML Hook](#110-pre-import-html-hook)
2. [Custom Blocks](#2-custom-blocks) — **HIGH**
   - 2.1 [Register a Custom Block](#21-register-a-custom-block)
   - 2.2 [Block Props Schema](#22-block-props-schema)
   - 2.3 [Block Component Props](#23-block-component-props)
   - 2.4 [Nesting and Wrapper Blocks](#24-nesting-and-wrapper-blocks)
   - 2.5 [Block Data Provider](#25-block-data-provider)
   - 2.6 [i18n, AI, and Inline Edit Props](#26-i18n-ai-and-inline-edit-props)
3. [Server Setup](#3-server-setup) — **HIGH**
   - 3.1 [Next.js Config — withChaiBuilder](#31-nextjs-config--withchaibuilder)
   - 3.2 [Server Config — buildChaiBuilderConfig](#32-server-config--buildchaibuilderconfig)
   - 3.3 [Request Context — createChaiBuilder](#33-request-context--createchaibuilder)
   - 3.4 [getChaiBuilder — Request-Scoped Instance](#34-getchaibuilder--request-scoped-instance)
   - 3.5 [Custom Server Actions](#35-custom-server-actions)
   - 3.6 [Global Data Provider, Page Types, and Collections](#36-global-data-provider-page-types-and-collections)
4. [Page Rendering](#4-page-rendering) — **HIGH**
   - 4.1 [Render a ChaiBuilder Page](#41-render-a-chaibuilder-page)
   - 4.2 [Styles Utilities](#42-styles-utilities)
   - 4.3 [Partial Blocks and Custom Block Components](#43-partial-blocks-and-custom-block-components)

---

## 1. Extend Builder UI

**Impact: HIGH**

APIs for customising the ChaiBuilder editor — adding sidebar panels, injecting components via slots, hooking into lifecycle events, registering feature flags, custom tabs, and block libraries. All APIs are **client-only** and must be called at module level before `ChaiWebsiteBuilder` mounts.

---

### 1.1 Setup Pattern — Centralise Registrations

All register APIs are client-only and must run before `ChaiWebsiteBuilder` mounts. Centralise them in a single setup file imported at the top of your editor page.

**Correct:**

```ts
// app/(builder)/chai-setup.ts
import { registerChaiSidebarPanel } from "@chaibuilder/core";
import { registerChaiSlot, CHAI_SLOT_IDS } from "@chaibuilder/core";
import { registerChaiHook, CHAI_HOOKS } from "@chaibuilder/core";
import { registerChaiFeatureFlag } from "@chaibuilder/core";

registerChaiSidebarPanel("my-panel", { ... });
registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT, MyButton);
registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, myBeforeSaveHook);
registerChaiFeatureFlag("advanced-mode", { description: "Advanced features" });
```

```tsx
// app/(builder)/editor/page.tsx
"use client";
import "../chai-setup"; // ← runs all registrations before mount
import { ChaiWebsiteBuilder } from "@chaibuilder/core";

export default function EditorPage() {
  return <ChaiWebsiteBuilder {...props} />;
}
```

**Incorrect (inline in component or in a Server Component):**

```tsx
// ❌ registers on every render
export default function EditorPage() {
  registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT, MyButton);
  return <ChaiWebsiteBuilder />;
}

// ❌ throws — @chaibuilder/core is not available on the server
import { registerChaiSlot } from "@chaibuilder/core"; // in a Server Component
```

**Rules:**

- `@chaibuilder/core` throws if imported in a server context — always use inside `"use client"` files or their non-async imports
- One `chai-setup.ts` per project; import it exactly once at the editor entry point
- Register calls warn on duplicate IDs — never call them inside loops or reactive code

---

### 1.2 Add a Custom Sidebar Panel

Use `registerChaiSidebarPanel` to add a custom panel to the builder sidebar.

**Correct:**

```tsx
import { registerChaiSidebarPanel } from "@chaibuilder/core";

registerChaiSidebarPanel("analytics-panel", {
  position: "bottom", // "top" | "bottom"
  view: "drawer", // "standard" | "modal" | "overlay" | "drawer"
  label: "Analytics",
  width: 320, // optional, pixels
  button: ({ isActive, show }) => (
    <button onClick={show} aria-pressed={isActive}>
      <BarChartIcon />
    </button>
  ),
  panel: AnalyticsPanelComponent,
});
```

**Incorrect (registering inside a component):**

```tsx
export default function EditorPage() {
  // ❌ re-registers on every render
  registerChaiSidebarPanel("analytics-panel", { ... });
  return <ChaiWebsiteBuilder />;
}
```

**Rules:**

- `position: "top"` groups with main nav icons; `"bottom"` appears below
- `view: "standard"` replaces the default side panel content area
- `view: "drawer" | "overlay" | "modal"` renders on top of the builder canvas
- Duplicate `panelId` logs a warning and overrides the previous registration

---

### 1.3 Inject Components via Slots

Use `registerChaiSlot` with `CHAI_SLOT_IDS` constants to inject React components into specific UI locations.

**Correct:**

```ts
import { registerChaiSlot, CHAI_SLOT_IDS } from "@chaibuilder/core";

registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT, MyTopbarButton);
registerChaiSlot(CHAI_SLOT_IDS.AFTER_BLOCK_OPTIONS, ExtraBlockActions);

// SEO panel tab pair — register trigger and content together
registerChaiSlot(CHAI_SLOT_IDS.SEO_PANEL.TRIGGER, MySeoTabTrigger);
registerChaiSlot(CHAI_SLOT_IDS.SEO_PANEL.CONTENT, MySeoTabContent);
```

**Available Slot IDs (`CHAI_SLOT_IDS`):**

| Constant                   | Location                            |
| -------------------------- | ----------------------------------- |
| `TOPBAR_LEFT`              | Left area of the top bar            |
| `TOPBAR_CENTER`            | Center of the top bar               |
| `TOPBAR_RIGHT`             | Right area of the top bar           |
| `TOP_BAR`                  | Replaces the entire top bar         |
| `MEDIA_MANAGER`            | Replaces the media manager          |
| `BEFORE_OUTLINE`           | Above the block outline panel       |
| `AFTER_BLOCK_OPTIONS`      | After block context menu options    |
| `AFTER_BODY_BLOCK_OPTIONS` | After body block context options    |
| `AFTER_BUILDER`            | After the builder root element      |
| `AFTER_PAGE_MORE_OPTIONS`  | After page more-options menu        |
| `BLOCK_STYLING_ELEMENTS`   | Extra elements in block style panel |
| `SEO_PANEL.TRIGGER`        | Extra trigger tab in SEO panel      |
| `SEO_PANEL.CONTENT`        | Content for the extra SEO tab       |

**Incorrect (raw string instead of constant):**

```ts
// ❌ typos won't be caught
registerChaiSlot("topbar-righ", MyButton);
```

**Rules:**

- Always use `CHAI_SLOT_IDS` constants — never raw strings
- Multiple components per slot all render by default
- On slots with `multiple: false`, only the **last registered** component renders
- `React.lazy` components are automatically wrapped in `<Suspense>`
- Errors in slot components are isolated by `ErrorBoundary` — won't crash the builder

---

### 1.4 Lifecycle Hooks

Use `registerChaiHook` to intercept ChaiBuilder lifecycle events. Hooks run as a **pipeline** — each receives the output of the previous.

**Correct:**

```ts
import { registerChaiHook, CHAI_HOOKS } from "@chaibuilder/core";

// Transform data before save
registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, async (pageData, context) => {
  // context: { pageId, operation, userId }
  return { ...pageData, updatedAt: Date.now() };
});

// Side-effect after save — return undefined to pass data unchanged
registerChaiHook(CHAI_HOOKS.AFTER_SAVE_PAGE, (pageData, context) => {
  analytics.track("page_saved", { pageId: context?.pageId });
  // no return = data passes through as-is
});
```

**Available hooks (`CHAI_HOOKS`):**

| Hook               | When                          |
| ------------------ | ----------------------------- |
| `BEFORE_SAVE_PAGE` | Before page data is persisted |
| `AFTER_SAVE_PAGE`  | After page data is persisted  |

**Incorrect (mutating instead of returning):**

```ts
registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, (pageData) => {
  // ❌ mutates — return a new object instead
  pageData.updatedAt = Date.now();
});
```

**Rules:**

- Return a new object to pass modified data forward; return `undefined` to pass data unchanged
- Errors are caught and logged — pipeline continues with last valid data
- Hooks execute in registration order

---

### 1.5 Feature Flags

Register toggleable flags that users can enable inside the builder. State persists in `localStorage`.

**Registering:**

```ts
import { registerChaiFeatureFlag, registerChaiFeatureFlags } from "@chaibuilder/core";

registerChaiFeatureFlag("advanced-mode", {
  value: false,
  description: "Enable advanced editing features",
});

registerChaiFeatureFlags({
  "beta-ai": { description: "AI-powered suggestions" },
  "dark-canvas": { description: "Dark background on canvas" },
});
```

**Reading in components:**

```tsx
import { useChaiFeatureFlag, IfChaiFeatureFlag } from "@chaibuilder/core";

function MyComponent() {
  const isAdvanced = useChaiFeatureFlag("advanced-mode");
  return isAdvanced ? <AdvancedPanel /> : null;
}

<IfChaiFeatureFlag flagKey="advanced-mode">
  <AdvancedPanel />
</IfChaiFeatureFlag>;
```

**Rules:**

- State persists via jotai `atomWithStorage` (`localStorage`)
- Default `value` is `false` if not specified
- Duplicate key logs a warning and overrides

---

### 1.6 Add Block Tab

Inject a custom tab into the "Add Block" drawer.

**Correct:**

```tsx
import { registerChaiAddBlockTab } from "@chaibuilder/core";

registerChaiAddBlockTab("my-templates", {
  tab: () => <span>Templates</span>,
  tabContent: MyTemplatesPanel,
});
```

**Rules:**

- `tab` — the clickable trigger component
- `tabContent` — panel shown when tab is active
- Duplicate `id` logs a warning and overrides

---

### 1.7 Custom Block Library

Register a source of blocks users can browse and insert.

**Correct:**

```ts
import { registerChaiLibrary } from "@chaibuilder/core";

registerChaiLibrary("my-library", {
  name: "My Components",
  description: "Company design system blocks",
  getBlocksList: async (library) => {
    const blocks = await fetchMyBlocks();
    return blocks.map((b) => ({ id: b.id, name: b.name, preview: b.previewUrl }));
  },
  getBlock: async ({ library, block }) => {
    // Return HTML string OR ChaiBlock[]
    return await fetchBlockHtml(block.id);
  },
});
```

**Rules:**

- `getBlocksList` → list shown in library panel
- `getBlock` → returns actual block content as HTML string or `ChaiBlock[]`
- Duplicate `id` silently overrides the previous library

---

### 1.8 Custom Block Setting Widgets, Fields, and Templates

Extend the block settings form (RJSF) with custom UI components.

**Register:**

```ts
import {
  registerChaiBlockSettingWidget,
  registerChaiBlockSettingField,
  registerChaiBlockSettingTemplate,
} from "@chaibuilder/core";

registerChaiBlockSettingWidget("color-picker", ColorPickerWidget);
registerChaiBlockSettingField("icon-selector", IconSelectorField);
registerChaiBlockSettingTemplate("inline-label", InlineLabelTemplate);
```

**Reference in block props schema:**

```ts
import { registerChaiBlockProps } from "@chaibuilder/core/registry";

registerChaiBlockProps({
  type: "object",
  properties: {
    accentColor: {
      type: "string",
      ui: { "ui:widget": "color-picker" },
    },
    icon: {
      type: "string",
      ui: { "ui:field": "icon-selector" },
    },
  },
});
```

**Rules:**

- IDs are global — use namespaced keys to avoid collisions (e.g. `"myapp-color-picker"`)
- The `ui` key on a prop schema becomes the RJSF `uiSchema` entry for that field

---

### 1.9 Custom Save to Library Dialog

Replace the default "Save to Library" dialog.

**Correct:**

```tsx
import { registerChaiSaveToLibrary } from "@chaibuilder/core";

registerChaiSaveToLibrary(({ blockId, blocks, close }) => (
  <MyLibraryDialog blockId={blockId} blocks={blocks} onClose={close} />
));
```

| Prop      | Type          | Description                   |
| --------- | ------------- | ----------------------------- |
| `blockId` | `string`      | ID of the block being saved   |
| `blocks`  | `ChaiBlock[]` | The block and its descendants |
| `close`   | `() => void`  | Call to close the dialog      |

**Rules:**

- Singleton — only one component; last call wins

---

### 1.10 Pre-Import HTML Hook

Transform raw HTML before it's converted into ChaiBlocks.

**Correct:**

```ts
import { registerChaiPreImportHTMLHook } from "@chaibuilder/core";

registerChaiPreImportHTMLHook(async (html) => {
  return sanitizeHtml(html);
});
```

**Rules:**

- Singleton — only one hook; last call wins
- Must return the transformed HTML string
- Async functions are supported

---

## 2. Custom Blocks

**Impact: HIGH**

APIs for defining and registering custom block components. Blocks are the building units of pages in ChaiBuilder. Each block has a React component (the rendered output) and a Config object (metadata, props schema, editor behaviour).

All imports for blocks come from `@chaibuilder/core/registry` (not `@chaibuilder/core`).

---

### 2.1 Register a Custom Block

**Correct:**

```tsx
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "@chaibuilder/core/registry";
import type { ChaiBlockComponentProps, ChaiBlockConfig, ChaiStyles } from "@chaibuilder/core/types";

type AlertProps = {
  message: string;
  variant: "info" | "warning" | "error";
  styles: ChaiStyles;
};

const AlertComponent = (props: ChaiBlockComponentProps<AlertProps>) => {
  const { blockProps, styles, message, variant } = props;
  return (
    <div {...blockProps} {...styles} data-variant={variant}>
      {message}
    </div>
  );
};

const AlertConfig: ChaiBlockConfig = {
  type: "Alert", // unique PascalCase string — no spaces
  label: "Alert", // shown in the builder UI
  group: "basic", // panel group in "Add Block"
  category: "core", // optional, defaults to "core"
  description: "An alert box for messages",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("rounded-md p-4 bg-blue-50"),
      message: {
        type: "string",
        title: "Message",
        default: "Alert message here",
      },
      variant: {
        type: "string",
        title: "Variant",
        default: "info",
        enum: ["info", "warning", "error"],
      },
    },
  }),
  i18nProps: ["message"],
  aiProps: ["message"],
};

registerChaiBlock(AlertComponent, AlertConfig);
```

**Rules:**

- `type` must be unique across all blocks — use PascalCase (e.g. `"MyAlert"`)
- `props` must use `registerChaiBlockProps()` — not a raw object
- Never spread `...props` onto DOM elements — use `blockProps` and `styles` separately
- Call `registerChaiBlock` at module level, before the builder mounts
- Imports from `@chaibuilder/core/registry`, not `@chaibuilder/core`

---

### 2.2 Block Props Schema

Use `registerChaiBlockProps(schema)` to define editable props. It extracts `ui` keys into `uiSchema` automatically.

```ts
import { registerChaiBlockProps, stylesProp, builderProp } from "@chaibuilder/core/registry";

const props = registerChaiBlockProps({
  properties: {
    styles: stylesProp("rounded-lg p-4 bg-white shadow"),

    title: { type: "string", title: "Title", default: "Card Title" },

    size: {
      type: "string",
      title: "Size",
      default: "md",
      enum: ["sm", "md", "lg"],
      enumNames: ["Small", "Medium", "Large"],
    },

    link: {
      type: "object",
      properties: { href: { type: "string" }, target: { type: "string" } },
      default: { href: "", target: "_self" },
      ui: { "ui:field": "link" },
    },

    // Builder-only prop — visible in editor, not rendered
    editorNote: builderProp({ type: "string", title: "Editor note", default: "" }),
  },
});
```

**`stylesProp(defaultClasses)`** — required for any block that uses Tailwind styles:

```ts
styles: stylesProp("flex items-center gap-2");
```

**Rules:**

- Every block with Tailwind styles must include `styles: stylesProp(...)` — without it, styles can't be edited
- The `ui` key on any property is auto-extracted to `uiSchema`
- Reserved names that throw: `_type`, `_id`, `_parent`, `_bindings`, `_name`
- Names that cannot be in schema (runtime only): `$loading`, `blockProps`, `inBuilder`, `lang`, `draft`, `pageProps`, `pageData`, `children`

---

### 2.3 Block Component Props

Every component receives `ChaiBlockComponentProps<T>` — your props merged with runtime-injected props.

```tsx
import type { ChaiBlockComponentProps, ChaiStyles } from "@chaibuilder/core/types";

type MyProps = { title: string; styles: ChaiStyles };

const MyBlock = ({ blockProps, styles, title, inBuilder, children, $loading }: ChaiBlockComponentProps<MyProps>) => (
  <div {...blockProps} {...styles}>
    {$loading ? <Skeleton /> : title}
    {children}
  </div>
);
```

**Runtime-injected props (always available, never in schema):**

| Prop         | Type                     | Description                         |
| ------------ | ------------------------ | ----------------------------------- |
| `blockProps` | `Record<string, string>` | Spread on root DOM element          |
| `inBuilder`  | `boolean`                | `true` inside the editor            |
| `lang`       | `string`                 | Current language code               |
| `draft`      | `boolean`                | `true` in preview/draft mode        |
| `children`   | `ReactNode`              | Child blocks (when `wrapper: true`) |
| `pageProps`  | `ChaiPageProps`          | `{ slug, searchParams }`            |
| `pageData`   | `any`                    | Resolved by `dataProvider`          |
| `$loading`   | `boolean`                | `true` while `dataProvider` fetches |

**Rules:**

- Always spread `blockProps` on the root element — carries builder-required attributes
- Always spread `styles` on the root element — carries Tailwind class strings
- Never spread the full `props` object onto a DOM element

---

### 2.4 Nesting and Wrapper Blocks

To make a block a container, set `wrapper: true` and render `{children}`.

```tsx
const CardConfig: ChaiBlockConfig = {
  type: "Card",
  label: "Card",
  group: "layout",
  wrapper: true, // ← makes it a container
  props: registerChaiBlockProps({
    properties: { styles: stylesProp("rounded-lg border p-4") },
  }),
  canAcceptBlock: (childType) => true, // allow any child
  canBeNested: (parentType) => true, // allow inside any parent
};

const CardComponent = ({ blockProps, styles, children }: ChaiBlockComponentProps<CardProps>) => (
  <div {...blockProps} {...styles}>
    {children}
  </div>
);
```

**Restricting nesting:**

```ts
canAcceptBlock: (type) => ["Text", "Image", "Button"].includes(type),
canBeNested: (parentType) => parentType === "Box",
```

**Rules:**

- `wrapper: true` AND rendering `{children}` are both required — omitting either breaks nesting
- `canAcceptBlock` / `canBeNested` default to allowing everything when not specified

---

### 2.5 Block Data Provider

Attach async data fetching to a block via `dataProvider` in config.

```tsx
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
    return fetchProduct(block.productId, { lang, draft });
  },
  dataProviderMode: "live",
  dataProviderDependencies: ["productId"], // re-fetch when this prop changes
};
```

**Accessing resolved data in the component:**

```tsx
// Second generic types the resolved data shape
const ProductComponent = (props: ChaiBlockComponentProps<ProductProps, { name: string; price: number }>) => {
  const { $loading, pageData, blockProps, styles } = props;
  if ($loading) return <div {...styles} className="h-20 animate-pulse bg-gray-100" />;
  return (
    <div {...blockProps} {...styles}>
      {pageData?.name} — ${pageData?.price}
    </div>
  );
};
```

**Rules:**

- `dataProviderDependencies` — array of prop keys; re-fetches when those values change
- `dataProviderMode: "live"` → runs in builder + render; `"mock"` → uses mock data in builder
- Always handle `$loading: true` — show a skeleton
- `registerChaiServerBlock(component, { type, dataProvider })` overrides just the data provider for server rendering

---

### 2.6 i18n, AI, and Inline Edit Props

```ts
const BannerConfig: ChaiBlockConfig = {
  type: "Banner",
  label: "Banner",
  group: "marketing",
  props: registerChaiBlockProps({ ... }),
  i18nProps: ["title", "subtitle", "ctaLabel"],  // translatable
  aiProps: ["title", "subtitle"],                 // AI can generate
  inlineEditProps: ["title", "subtitle"],         // double-click to edit on canvas
};
```

**`closestBlockProp` — read a prop from the nearest ancestor block:**

```ts
import { closestBlockProp } from "@chaibuilder/core/registry";

properties: {
  repeaterLang: closestBlockProp("Repeater", "lang"),
}
```

**Rules:**

- `i18nProps` — only string/rich-text props that vary per language
- `aiProps` — only string props the AI should write to (not styles, IDs, or booleans)
- `inlineEditProps` — shows inline text editor on canvas double-click
- `closestBlockProp` creates a hidden runtime prop — never appears in settings UI

---

## 3. Server Setup

**Impact: HIGH**

Server-side configuration for ChaiBuilder Core in a Next.js App Router project. Covers the `next.config.ts` wrapper, the main server config, per-request context resolution, the `getChaiBuilder` instance API, custom server actions, and data providers.

All server imports come from `@chaibuilder/core/server` or `@chaibuilder/core/next`. Never import these in client components.

---

### 3.1 Next.js Config — withChaiBuilder

Wrap `next.config.ts` with `withChaiBuilder` to auto-generate the import map for collections and actions.

```ts
// next.config.ts
import { withChaiBuilder } from "@chaibuilder/core/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withChaiBuilder(nextConfig);
```

**With custom options:**

```ts
export default withChaiBuilder(nextConfig, {
  collections: "src/collections/**/*.{ts,tsx}", // default
  actions: "src/app/(builder)/**/actions/**/*.{ts,tsx}", // default
  importMapPath: "src/chaibuilder-import-map.ts", // default
  watch: true, // dev file watching
});
```

**Rules:**

- Generates `src/chaibuilder-import-map.ts` at startup and on file changes in dev
- Collection files scanned from `src/collections/**`; action files from `src/app/(builder)/**/actions/**`
- The generated file is auto-imported — do not edit it manually

---

### 3.2 Server Config — buildChaiBuilderConfig

Create the frozen server config. Pass this object to every `getChaiBuilder` call.

```ts
// chaibuilder.config.ts
import "server-only";
import { buildChaiBuilderConfig } from "@chaibuilder/core/server";

export const chaiConfig = buildChaiBuilderConfig({
  db, // required — createSQLiteDB(), createPostgresDB(), etc.
  globalDataProvider: async ({ lang, draft, inBuilder }) => ({
    siteName: "My Site",
    nav: await fetchNav({ lang, draft }),
  }),
  pageTypes: [{ type: "blog-post", label: "Blog Post", dataProvider: blogPostDataProvider }],
  collections: [
    /* ... */
  ],
  blockDataProviders: {
    ProductCard: async ({ block, lang, draft }) => fetchProduct(block.productId, { lang, draft }),
  },
  actions: {
    CHECK_USER_ACCESS: new CheckUserAccessAction(),
  },
  debugLevel: 0, // 0 = off | 1 = DB+HTTP | 2 = full timing+SQL
});
```

**With `onInit` and `extend`:**

```ts
export const chaiConfig = buildChaiBuilderConfig(
  { db, globalDataProvider },
  {
    onInit: async (config) => {
      await runMigrations();
    },
    extend: { myValue: "hello" }, // accessible as config.myValue
  },
);
```

**`ChaiBuilderServerConfigInput` key fields:**

| Field                | Required | Description                   |
| -------------------- | -------- | ----------------------------- |
| `db`                 | ✅       | Database connection           |
| `globalDataProvider` | —        | Data merged into every render |
| `pageTypes`          | —        | Per-page-type data providers  |
| `collections`        | —        | Collection/repeater configs   |
| `blockDataProviders` | —        | Per-block-type server data    |
| `actions`            | —        | Custom server actions         |
| `debugLevel`         | —        | `0\|1\|2` verbosity           |

**Rules:**

- Server-only — never import in client components
- Returned config is `Object.freeze`d — do not mutate
- `onInit` runs exactly once, on the first `getChaiBuilder` call in the process

---

### 3.3 Request Context — createChaiBuilder

Every request needs one envelope of facts, the `ChaiRequestContext`: **WHERE** (`appId`, `siteUrl`), **WHO** (`userId`, `role`, `permissions`, `delegatedPermissions`), **HOW** (`draft`, `lang`). The host resolves it, because auth, tenancy, and site URL are host decisions. `createChaiBuilder` binds that resolver to the config and returns the `getChaiBuilder` entry points call.

The resolver lives outside `chaibuilder.config.ts` on purpose: it needs framework APIs (`next/headers`), while the config must stay plain data that scripts and CI can import.

**`request` presence by call site:**

| Context                    | `request`        | Identity source                |
| -------------------------- | ---------------- | ------------------------------ |
| Route handler (`route.ts`) | ✅ `NextRequest` | `Authorization: Bearer` header |
| Page / layout (`page.tsx`) | ❌ `undefined`   | `next/headers` cookies         |
| Server action              | ❌ `undefined`   | `next/headers` cookies         |
| Outside Next.js (scripts)  | ❌ `undefined`   | env vars / hardcoded           |

**Step 1 — Create the handle once:**

```ts
// chaibuilder.server.ts  (root — not inside pro/)
import { cookies, draftMode } from "next/headers";
import { createChaiBuilder, type ChaiIncomingRequest } from "@chaibuilder/core/server";
import config from "@/chaibuilder.config";

/** Route handlers: identity from Authorization: Bearer header */
async function userIdFromRequest(request: ChaiIncomingRequest): Promise<string | null> {
  const token = (request.headers.get("authorization") ?? "").split(" ")[1];
  if (!token) return null;
  return (await verifyJwt(token))?.id ?? null;
}

/** Server components + server actions: identity from auth cookies */
async function userIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return (await getSessionFromCookies(cookieStore))?.userId ?? null;
}

export const { getChaiBuilder } = createChaiBuilder(config, {
  context: async ({ request }) => {
    const { isEnabled } = await draftMode();
    const userId = request ? await userIdFromRequest(request) : await userIdFromCookies();
    return {
      appId: process.env.CHAIBUILDER_APP_KEY ?? "",
      siteUrl: process.env.SITE_URL,
      draft: isEnabled,
      userId,
    };
  },
});
```

**Step 2 — Import `getChaiBuilder` in every server entry (a real import — nothing to forget):**

```ts
// 1. Route handler — request present → Authorization header
import { getChaiBuilder } from "@/chaibuilder.server";
import { handleChaiActionRequest } from "@chaibuilder/core/nextjs/server";
export async function POST(request: NextRequest, props) {
  const cb = await getChaiBuilder(props, request); // resolver receives request
  return handleChaiActionRequest(request, cb.handleHttpAction);
}

// 2. Page / layout — no request → next/headers cookies
import { getChaiBuilder } from "@/chaibuilder.server";
export default async function Page(props) {
  const cb = await getChaiBuilder(props); // resolver receives undefined
  // ...
}

// 3. Server action — no request → reuses this request's context
("use server");
import { getChaiBuilder } from "@/chaibuilder.server";
export async function saveSettings(data: unknown) {
  const cb = await getChaiBuilder();
}

// 4. Outside Next.js (seed script) — same factory, no next/headers
const { getChaiBuilder } = createChaiBuilder(chaiConfig, {
  context: async () => ({
    appId: process.env.CHAIBUILDER_APP_KEY ?? "",
    userId: "seed-script",
    draft: false,
  }),
});
const cb = await getChaiBuilder();
```

**Permissions — who decides:**

```ts
// The resolver is the only place authz is decided. Ask ChaiBuilder's own app_users table:
const access = userId ? await resolveChaiAppUserAccess({ appId, userId }) : null;
return { appId, userId, ...(access ?? {}) };   // null → not a member → 401

// ...or answer it yourself:
{ userId, role: "editor", permissions: ["pages:*"] }

// Delegation: ceiling for the credential (OAuth/MCP token), independent of the user.
// Effective = permissions ∩ delegatedPermissions.
{ userId, permissions: ["*"], delegatedPermissions: ["pages:read"] } // → pages:read only
```

**`ChaiRequestContext` returned shape:**

```ts
type ChaiRequestContext = {
  appId: string; // auto-filled from CHAIBUILDER_APP_KEY if omitted
  userId?: string | null;
  role?: string | null; // defaults to "custom"
  permissions?: string[] | null; // the authz decision; omit/null → not a member (401)
  delegatedPermissions?: string[] | null; // credential ceiling; omit → no clamp
  draft?: boolean;
  siteUrl?: string | null;
  lang?: string;
};
```

**Rules:**

- Create the handle once (e.g. `chaibuilder.server.ts`) — import `getChaiBuilder` from it in every entry
- `getChaiBuilder(props, request)` in route handlers, `getChaiBuilder(props)` in pages, `getChaiBuilder()` elsewhere
- Always branch `if (request)` → header path; `else` → `next/headers` cookies path
- `draftMode()` from `next/headers` works in both route handlers and server components in Next.js 15+
- Outside Next.js: never call `next/headers` — use a pure env-based resolver
- `setChaiContextResolver` + `import "@/chai-context"` side-effect imports still work but are deprecated: a missed import silently downgraded that entry to the env-only context

---

### 3.4 getChaiBuilder — Request-Scoped Instance

Returns a request-scoped instance with all server APIs bound to the current context.

**In a page / layout:**

```ts
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";

export default async function Page(props: { params: Promise<{ slug: string[] }> }) {
  const cb = await getChaiBuilder(props);
  const payload = await cb.getPagePayload(slug);
  return <RenderChaiBlocks {...payload} />;
}

export async function generateMetadata(props) {
  const cb = await getChaiBuilder(props);
  return cb.generateMetaData(slug);
}
```

**In a route handler (the required `POST /api/chai`):**

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
| `cb.getPagePayload(slug)`   | Full render payload                                             |
| `cb.generateMetaData(slug)` | Next.js `Metadata` object                                       |
| `cb.handleHttpAction(body)` | Dispatch a builder action from a parsed `{ action, data }` body |
| `cb.getSiteSettings()`      | Site-wide settings                                              |
| `cb.getSiteGlobalData()`    | Output of `globalDataProvider`                                  |
| `cb.getPageData(slug)`      | Resolved data for a page                                        |
| `cb.getPages()`             | All pages                                                       |

**Rules:**

- Pass `routeProps` (the component `props`) on the **first** call per request — subsequent calls can omit it
- Server-only — never call from client components
- The instance is request-scoped — do not cache or share across requests
- `handleHttpAction` is the **only** entry point for client→server action dispatch

---

### 3.5 Custom Server Actions

Extend ChaiBuilder by registering custom actions. All actions extend `ChaiBaseAction`.

**Define an action:**

```ts
// src/app/(builder)/api/actions/check-user-access.ts
import { ChaiBaseAction } from "@chaibuilder/core/server";
import { z } from "zod";

export class CheckUserAccessAction extends ChaiBaseAction {
  protected getValidationSchema() {
    return z.object({}).passthrough();
  }

  async execute(_data: unknown) {
    const { userId, appId } = this.context!;
    const user = await db.query.users.findFirst({
      where: (u) => eq(u.id, userId!) && eq(u.appId, appId),
    });
    if (!user) return { access: false };
    return { access: true, role: user.role, permissions: user.permissions };
  }
}
```

**Register in config:**

```ts
export const chaiConfig = buildChaiBuilderConfig({
  db,
  actions: { CHECK_USER_ACCESS: new CheckUserAccessAction() },
});
```

**`ChaiBaseAction` contract:**

```ts
abstract class ChaiBaseAction<TInput = any, TOutput = any> {
  context: ChaiActionContext | null; // set by dispatcher before execute()
  requiredPermission?: string | fn; // undefined = auth only
  protected getValidationSchema(): ZodType; // override to validate input
  abstract execute(data: TInput): Promise<TOutput>;
}
```

**Dispatching actions programmatically:**

```ts
import { dispatchChaiAction, tryChaiAction } from "@chaibuilder/core/server";

const result = await dispatchChaiAction("MY_ACTION", { key: "value" }); // throws on error
const safe = await tryChaiAction("MY_ACTION", { key: "value" }); // { ok, data } | { ok, error }
```

**Rules:**

- `CHECK_USER_ACCESS` action is **required** for authenticated actions to work
- Action names are UPPER_SNAKE_CASE by convention
- `this.context` is set before `execute()` — safe to use without null-checks
- `requiredPermission` is enforced before `execute()` — throw `ActionError` for business failures

---

### 3.6 Global Data Provider, Page Types, and Collections

Three hooks for server-side data injection.

**`globalDataProvider`** — runs on every page render:

```ts
buildChaiBuilderConfig({
  db,
  globalDataProvider: async ({ lang, draft, inBuilder }) => ({
    nav: await fetchNavigation({ lang, draft }),
    siteName: "My Site",
  }),
});
```

**`pageTypes[].dataProvider`** — runs only for matching page type:

```ts
const blogPageType: ChaiPageTypeEntry = {
  type: "blog-post",
  label: "Blog Post",
  dataProvider: async ({ lang, draft, pageProps }) => ({
    post: await fetchPost(pageProps.slug, { lang, draft }),
  }),
};
```

**`blockDataProviders`** — runs per block instance:

```ts
buildChaiBuilderConfig({
  db,
  blockDataProviders: {
    ProductCard: async ({ block, lang, draft }) => fetchProduct(block.productId, { lang, draft }),
  },
});
```

**Precedence / merging:**

1. `globalDataProvider` → base data for all pages
2. `pageTypes[].dataProvider` → deep-merged on top (only for matching `_pageType`)
3. `blockDataProviders` → injected into individual blocks as `pageData`

**Rules:**

- All three are async and server-only
- Not cached by default — keep them fast or add your own caching layer
- `inBuilder: true` when called from the editor — return mock/simplified data if needed

---

## 4. Page Rendering

**Impact: HIGH**

APIs for rendering ChaiBuilder pages in Next.js App Router. All render imports come from `@chaibuilder/core/render`.

---

### 4.1 Render a ChaiBuilder Page

**Correct — full page component:**

```tsx
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";
import { RenderChaiBlocks, ChaiPageCSS, ChaiPageJSONLD, PreviewBanner } from "@chaibuilder/core/render";

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

**`ChaiPageCSS` + `ChaiPageJSONLD` — place in the layout `<head>`:**

```tsx
// app/(public)/layout.tsx
import { ChaiPageCSS, ChaiPageJSONLD } from "@chaibuilder/core/render";

export default async function Layout({ children }) {
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

| Prop              | Required | Description                          |
| ----------------- | -------- | ------------------------------------ |
| `page`            | ✅       | `ChaiFullPage` from `getPagePayload` |
| `pageData`        | ✅       | Resolved data from data providers    |
| `settings`        | ✅       | Site settings from `getPagePayload`  |
| `pageProps`       | ✅       | `{ slug, searchParams }`             |
| `linkComponent`   | —        | Custom link renderer                 |
| `imageComponent`  | —        | Custom image renderer                |
| `buttonComponent` | —        | Custom button renderer               |
| `designTokens`    | —        | Override design tokens               |

**Rules:**

- `RenderChaiBlocks` is an async RSC — never render it from a `"use client"` component
- `ChaiPageCSS` must be in `<head>` — outputs Tailwind CSS + theme CSS variables + font `<style>` tags
- Always source `page`, `pageData`, `settings` from `cb.getPagePayload(slug)` — do not construct them manually
- `ChaiPageJSONLD` outputs structured data JSON-LD — place in `<head>` alongside `ChaiPageCSS`

---

### 4.2 Styles Utilities

**`getStylesForBlocks`** — generate Tailwind CSS for a block array (custom pipelines only):

```ts
import { getStylesForBlocks } from "@chaibuilder/core/render";

// Without Tailwind preflight (default)
const css = await getStylesForBlocks(blocks);

// With preflight for standalone pages
const css = await getStylesForBlocks(blocks, true);
```

**`getChaiThemeCssVariables`** — CSS custom properties from a theme object:

```ts
import { getChaiThemeCssVariables } from "@chaibuilder/core/render";

const cssVars = await getChaiThemeCssVariables({ theme: siteSettings.theme });
// inject: <style dangerouslySetInnerHTML={{ __html: cssVars }} />
```

**`PreviewBanner`** — fixed draft mode indicator (client component):

```tsx
import { PreviewBanner } from "@chaibuilder/core/render";

<PreviewBanner show={isDraft} disableUrl="/api/exit-preview" />;
```

**Rules:**

- `getStylesForBlocks` and `getChaiThemeCssVariables` are async — cache results where possible
- `ChaiPageCSS` calls both internally — only use these directly in custom render pipelines
- `PreviewBanner` is `"use client"` — safe in RSC trees; renders nothing when `show={false}`

---

### 4.3 Partial Blocks and Custom Block Components

**`getMergedPartialBlocks`** — inline partial blocks before rendering in a custom pipeline:

```ts
import { getMergedPartialBlocks } from "@chaibuilder/core/render";

// partials: Record<partialBlockId, ChaiBlock[]>
const merged = getMergedPartialBlocks(page.blocks, partials);
```

Only needed in custom pipelines — `RenderChaiBlocks` handles this automatically.

**Custom link / image / button components:**

```tsx
import NextImage from "next/image";
import NextLink from "next/link";

const MyImage = ({ styles, image, alt, width, height, blockProps }) => (
  <NextImage {...blockProps} {...styles} src={image} alt={alt} width={+width} height={+height} />
);

const MyLink = ({ styles, link, content, blockProps }) => (
  <NextLink {...blockProps} {...styles} href={link?.href ?? "/"} target={link?.target}>
    {content}
  </NextLink>
);

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

- Custom components accept `ChaiBlockComponentProps<T>` — always spread `blockProps` and `styles` on the root element
- `imageComponent`, `linkComponent`, `buttonComponent` can be `Promise<ComponentType>` (dynamic imports)
- If not provided, ChaiBuilder uses its built-in RSC implementations
