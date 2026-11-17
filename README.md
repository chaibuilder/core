# ChaiBuilder Core

**AI-enabled visual website builder for Next.js.**

[![npm](https://img.shields.io/npm/v/@chaibuilder/core.svg)](https://www.npmjs.com/package/@chaibuilder/core)
[![CI](https://github.com/chaibuilder/core/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/chaibuilder/core/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/chaibuilder/core)](https://github.com/chaibuilder/core/discussions)

Build, edit, and render websites with a block-based editor, custom React blocks, server-side data providers, and first-class App Router support.

- **Site:** [chaibuilder.com](https://chaibuilder.com)
- **Docs:** [chaibuilder.com/docs](https://chaibuilder.com/docs)
- **Package:** `@chaibuilder/core`
- **Requires:** Next.js ≥ 15.3 · React ≥ 19 · Tailwind CSS 4

---

## Why ChaiBuilder Core

| Capability    | What you get                                                                      |
| ------------- | --------------------------------------------------------------------------------- |
| Visual editor | Drag-and-drop canvas with Tailwind styling, media, SEO, and AI assist             |
| Custom blocks | Register React components with typed props schemas (`@chaibuilder/core/registry`) |
| Server config | Request-scoped `getChaiBuilder`, actions, collections, page types                 |
| RSC rendering | `RenderChaiBlocks`, `ChaiPageCSS`, JSON-LD, draft preview                         |
| Extensibility | Slots, sidebar panels, hooks, feature flags, libraries                            |
| Databases     | LibSQL, D1, better-sqlite3 adapters                                               |

---

## Install

Two supported ways to consume it.

**As a package** — the default:

```bash
pnpm add @chaibuilder/core
# or
npm install @chaibuilder/core
```

**As a git subtree** — when you want the source in your tree, editable, with a supported
path to pull upstream changes in:

```bash
git remote add chaibuilder-core git@github.com:chaibuilder/core.git
git fetch chaibuilder-core main
git subtree add --prefix=src/chai chaibuilder-core main
```

No `--squash` — the pull script needs real commits in your graph, so that later pulls are
ordinary 3-way merges rather than blind replacements of the directory.

Sync is **one-way**: you pull `@chaibuilder/core` in, you never push back. Changes you want
upstream go through a normal fork-and-PR on
[chaibuilder/core](https://github.com/chaibuilder/core).

Setup: [`scripts/HOST-SETUP.md`](scripts/HOST-SETUP.md). Staying current:
[`scripts/RUNBOOK.md`](scripts/RUNBOOK.md).

<details>
<summary>Prompt for setting this up with a coding agent</summary>

Paste into Claude Code (or any coding agent) from the root of your Next.js project:

```text
Vendor ChaiBuilder into this Next.js project as a git subtree, then wire it up.

1. Confirm the working tree is clean, and that this is a git repo with Next.js
   >= 15.3, React >= 19, and Tailwind 4. Stop and tell me if any of that is
   not true.
2. Add the subtree at src/chai. Do NOT pass --squash — the pull script refuses
   a squashed subtree, because without real merge bases a pull can only replace
   the directory and would silently discard local edits:
       git remote add chaibuilder-core git@github.com:chaibuilder/core.git
       git fetch chaibuilder-core main
       git subtree add --prefix=src/chai chaibuilder-core main
3. Read src/chai/scripts/HOST-SETUP.md and do what it says. In short:
   - add "pull:chai" and "status:chai" to package.json, pointing at
     src/chai/scripts/subtree-{pull,status}.mjs with --prefix=src/chai
   - add the eslint override that blocks host-app aliases (@/, ~~/, #/) inside
     src/chai, so the subtree keeps building standalone
   - turn off squash-merge and rebase-merge on this repo if you can: either one
     re-orphans the subtree history and breaks the next pull
4. Install the peer deps the package expects: next, react, react-dom,
   tailwindcss (v4), drizzle-orm, @tailwindcss/postcss, plus a sqlite driver
   (better-sqlite3, @libsql/client, or D1).
5. Follow the Quick start in src/chai/README.md to create chaibuilder.config.ts,
   chaibuilder.server.ts, the API route, a render page, and the editor mount.
   Use the SQLite adapter matching the driver from step 4.
6. Run the build and the dev server. Report what works and what does not —
   do not paper over failures.

Ask me before adding any dependency that is not in the list above.
```

</details>

Peer dependencies (install what you use):

```bash
pnpm add next react react-dom tailwindcss drizzle-orm
# Tailwind v4's PostCSS plugin:
pnpm add -D @tailwindcss/postcss
# Database example (better-sqlite3):
pnpm add better-sqlite3
```

---

## Quick start

### 1. Wrap Next.js config

```ts
// next.config.ts
import { withChaiBuilder } from "@chaibuilder/core/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withChaiBuilder(nextConfig);
```

### 2. Build server config

Plain data — keep framework imports out so scripts and CI can import it.

```ts
// chaibuilder.config.ts
import "server-only";
import { buildChaiBuilderConfig } from "@chaibuilder/core/nextjs/server";
import { createLibsqlDB } from "@chaibuilder/core/db/libsql"; // or @chaibuilder/core/db/d1, @chaibuilder/core/db/better-sqlite3

export const chaiConfig = buildChaiBuilderConfig({
  db: createLibsqlDB({ url: process.env.DATABASE_URL! }),
  globalDataProvider: async ({ lang, draft }) => ({
    siteName: "My Site",
  }),
});
```

### 3. Server handle

The handle binds the config to a request context — who is asking, for which site, in what mode — and returns the `getChaiBuilder` every entry point imports.

Write the resolver with `createChaiBuilder`:

```ts
// chaibuilder.server.ts
import { cookies, draftMode } from "next/headers";
import { createChaiBuilder } from "@chaibuilder/core/server";
import { chaiConfig } from "@/chaibuilder.config";

export const { getChaiBuilder } = createChaiBuilder(chaiConfig, {
  context: async ({ request }) => {
    const { isEnabled } = await draftMode();
    // Resolve userId from the Authorization header (route handlers)
    // or from cookies (pages / server actions)
    return {
      appId: process.env.CHAIBUILDER_APP_KEY ?? "",
      siteUrl: process.env.SITE_URL,
      draft: isEnabled,
      userId: null,
      // What they may do is decided here too. `resolveChaiAppUserAccess({ appId, userId })`
      // gives ChaiBuilder's own answer from the app_users table; or supply `role` +
      // `permissions` from wherever the host models access. No permissions = no access.
    };
  },
});
```

### 4. API route (required)

```ts
// app/(builder)/api/chai/route.ts
import { getChaiBuilder } from "@/chaibuilder.server";
import { handleChaiActionRequest } from "@chaibuilder/core/nextjs/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, props) {
  const cb = await getChaiBuilder(props, request);
  return handleChaiActionRequest(request, cb.handleHttpAction);
}
```

### 5. Render a page

```tsx
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";
import { RenderChaiBlocks, ChaiPageCSS, PreviewBanner } from "@chaibuilder/core/render";

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
      <ChaiPageCSS page={page} />
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

### 6. Mount the editor

```tsx
// app/(builder)/editor/page.tsx
"use client";
import "../chai-setup"; // registrations before mount
import { ChaiWebsiteBuilder } from "@chaibuilder/core";

export default function EditorPage() {
  return <ChaiWebsiteBuilder />;
}
```

---

## Package entry points

| Import                        | Use for                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `@chaibuilder/core`           | Editor UI — `ChaiWebsiteBuilder`, slots, hooks, panels (client-only) |
| `@chaibuilder/core/registry`  | `registerChaiBlock`, props helpers                                   |
| `@chaibuilder/core/types`     | Shared TypeScript types                                              |
| `@chaibuilder/core/utils`     | Binding analysis, block conversion, and other framework utilities    |
| `@chaibuilder/core/next`      | `withChaiBuilder` for `next.config`                                  |
| `@chaibuilder/core/server`    | Config, context, actions, `getChaiBuilder` (server-only)             |
| `@chaibuilder/core/render`    | `RenderChaiBlocks`, `ChaiPageCSS`, styles helpers                    |
| `@chaibuilder/core/styles`    | Builder CSS                                                          |
| `@chaibuilder/core/db/*`      | Database adapters and the drizzle schema barrel                      |
| `@chaibuilder/core/plugins/*` | Bundled client plugins (`empty-page-starter`, `page-errors`)         |
| `@chaibuilder/core/ai/*`      | AI provider plugins that import their SDK statically                 |

Never import `@chaibuilder/core` (the editor entry) from Server Components — it throws. Use `/server` and `/render` on the server.

---

## Custom blocks

```tsx
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "@chaibuilder/core/registry";
import type { ChaiBlockComponentProps, ChaiStyles } from "@chaibuilder/core/types";

type AlertProps = {
  message: string;
  styles: ChaiStyles;
};

const Alert = ({ blockProps, styles, message }: ChaiBlockComponentProps<AlertProps>) => (
  <div {...blockProps} {...styles}>
    {message}
  </div>
);

registerChaiBlock(Alert, {
  type: "Alert",
  label: "Alert",
  group: "basic",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("rounded-md p-4 bg-blue-50"),
      message: { type: "string", title: "Message", default: "Hello" },
    },
  }),
  i18nProps: ["message"],
  aiProps: ["message"],
});
```

Rules of thumb:

- Spread `blockProps` and `styles` on the root element — never `...props`
- Use `wrapper: true` + `{children}` for containers
- Attach `dataProvider` for async block data; handle `$loading`

---

## Safe data-binding pipes

Bindings support data paths followed by synchronous, non-executable pipes:

```text
{{listing.price | currency 'USD'}}
{{listing.title | trim | uppercase}}
```

Boolean-returning pipes are reserved for conditional visibility:

```text
{{listing.price | gt 0}}
```

Register application pipes once in a shared module that is imported before both editor startup and server rendering/configuration:

```ts
// chai-bindings.ts
import { registerChaiPipe } from "@chaibuilder/core/registry";

registerChaiPipe({
  name: "initials",
  label: "Initials",
  accepts: ["string"],
  returns: "string",
  transform: ({ value }) =>
    String(value)
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join(""),
});
```

```ts
// Import this from the client editor entry and server setup entry.
import "./chai-bindings";
```

Arguments may only be quoted strings, finite numbers, booleans, or `null`. Pipe output is still escaped, and raw HTML properties are sanitized after the pipeline runs. JavaScript expressions are unsupported: value bindings render empty and visibility bindings hide the block. A pipe that is not registered is skipped with a dev-only warning and the value passes through unformatted, so a removed pipe or a registration module that has not loaded yet does not blank the binding. Use `analyzeChaiBindings(blocks)` from `@chaibuilder/core/utils` to locate invalid bindings and recognized pipe conversions.

Value built-ins: `default`, `or`, `trim`, `uppercase`, `lowercase`, `capitalize`, `join`, `number`, `telephone`, `currency`, and `date`. Boolean built-ins are reserved for conditional visibility: `equals`, `notEquals`, `gt`, `gte`, `lt`, `lte`, `not`, `truthy`, `empty`, and `notEmpty`.

---

## Extend the builder UI

Register at module level in a setup file imported once before the editor mounts:

```ts
// chai-setup.ts
import {
  registerChaiSlot,
  registerChaiHook,
  registerChaiSidebarPanel,
  CHAI_SLOT_IDS,
  CHAI_HOOKS,
} from "@chaibuilder/core";

registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT, MyButton);

registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, async (pageData) => ({
  ...pageData,
  updatedAt: Date.now(),
}));

registerChaiSidebarPanel("analytics", {
  position: "bottom",
  view: "drawer",
  label: "Analytics",
  button: ({ show }) => <button onClick={show}>Stats</button>,
  panel: AnalyticsPanel,
});
```

Also available: feature flags, add-block tabs, custom libraries, RJSF widgets/fields, save-to-library dialog, pre-import HTML hook.

---

## AI providers

ChaiBuilder's AI features run on the [Vercel AI SDK](https://ai-sdk.dev). Model ids use the
`provider/model` slug convention (e.g. `anthropic/claude-sonnet-4`, `google/gemini-2.5-flash`),
so the same model catalogue works across providers.

Model requests are routed through a **provider** that ChaiBuilder installs as the AI SDK default.
Providers are pluggable — resolution priority is: `ai.provider` → provider plugins → the default
gateway. Nothing configured means the built-in **Vercel AI Gateway** (set `AI_GATEWAY_API_KEY`).

### Built-in provider plugins

Some providers ship as ready-made adapters that auto-activate from an env var. Install the
provider's SDK package (an optional peer dependency) and set the env — no code changes.

Register the plugin explicitly in production:

```ts
// chaibuilder.config.ts
import { openRouterPlugin } from "@chaibuilder/core/ai/openrouter"; // OPENROUTER_API_KEY
// import { openAICompatiblePlugin } from "@chaibuilder/core/ai/openai-compatible"; // OPENAI_COMPATIBLE_BASE_URL

buildChaiBuilderConfig({
  ai: { providers: [openRouterPlugin], models: [...] },
});
```

ChaiBuilder also detects these providers without registration, by importing the SDK at runtime —
convenient in development, but that import is invisible to bundlers, so Next's output file tracing
drops the package from a production build and the AI panel reports "configured but could not be
loaded". Registering the plugin from `@chaibuilder/core/ai/*` is a static import, which is why it survives
the build. Import it only when the SDK is installed.

**OpenRouter** — install `@openrouter/ai-sdk-provider`:

```bash
pnpm add @openrouter/ai-sdk-provider
```

```bash
OPENROUTER_API_KEY=sk-or-...
# optional attribution headers:
# OPENROUTER_APP_NAME=...  OPENROUTER_APP_URL=...
```

**Any OpenAI-compatible endpoint** — one adapter for Hugging Face Router, Groq, Together,
Fireworks, DeepInfra, Ollama, LM Studio, vLLM, self-hosted gateways, … Install
`@ai-sdk/openai-compatible`:

```bash
pnpm add @ai-sdk/openai-compatible
```

```bash
OPENAI_COMPATIBLE_BASE_URL=https://router.huggingface.co/v1
OPENAI_COMPATIBLE_API_KEY=hf_...          # optional (omit for keyless local servers)
OPENAI_COMPATIBLE_NAME=huggingface        # optional label, default "openai-compatible"
```

Model ids pass straight through, so use whatever the endpoint expects (e.g.
`meta-llama/Llama-3.3-70B-Instruct`, `llama3.1`).

**Cloudflare Workers AI** (REST mode) — install `workers-ai-provider`:

```bash
pnpm add workers-ai-provider
```

```bash
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

Workers AI uses `@cf/...` model ids (e.g. `@cf/meta/llama-3.1-8b-instruct`), so set
Cloudflare model ids in `ai.models` / per action. Inside a Worker, bind `env.AI` directly
via `ai.provider` (below) instead of REST credentials.

### Any provider via `ai.provider`

To plug in a provider with a bespoke SDK, or one that needs runtime objects (a Cloudflare
`env.AI` binding, Amazon Bedrock, a custom gateway, …), pass an AI SDK provider instance or
factory. It overrides the gateway and all plugins:

```ts
import { createWorkersAI } from "workers-ai-provider";

buildChaiBuilderConfig({
  db,
  ai: {
    // instance, or a (possibly async) factory
    provider: () => createWorkersAI({ binding: env.AI }), // inside a Worker
  },
});
```

### Custom provider plugins via `ai.providers`

To add your own "install package + set env var" provider (with the same auto-activation the
built-ins get), register a plugin. Plugins are tried ahead of the built-ins and activate when
`isConfigured()` returns true:

```ts
import type { ChaiAiProviderPlugin } from "@chaibuilder/core/types";

const myProvider: ChaiAiProviderPlugin = {
  id: "my-provider",
  isConfigured: () => Boolean(process.env.MY_PROVIDER_KEY),
  fingerprint: () => process.env.MY_PROVIDER_KEY, // rebuild on key rotation
  createProvider: async () => {
    const { createMyProvider } = await import("my-ai-sdk-provider");
    return createMyProvider({ apiKey: process.env.MY_PROVIDER_KEY });
  },
};

buildChaiBuilderConfig({ db, ai: { providers: [myProvider] } });
```

---

## Database adapters

```ts
import { createLibsqlDB } from "@chaibuilder/core/db/libsql";
import { createD1DB } from "@chaibuilder/core/db/d1";
import { createBetterSqliteDB } from "@chaibuilder/core/db/better-sqlite3";
```

Pass the returned setup into `buildChaiBuilderConfig({ db })`.

---

## Database migrations

ChaiBuilder ships **schema, not migrations**. Your app owns its migration
pipeline and generates the ChaiBuilder DDL into it, so there is one migration
history and one command to run.

### Drizzle hosts

Re-export the schema barrel once and point drizzle-kit at it alongside your own:

```ts
// src/db/chai-schema.ts
export * from "@chaibuilder/core/db/schema-sqlite";
```

```ts
// drizzle.config.ts
export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/chai-schema.ts"],
  out: "./drizzle",
});
```

Then `drizzle-kit generate` after each upgrade, and apply with `drizzle-kit
migrate`.

### Notes

- The barrel is the core table set. A plugin contributes its own tables through
  a schema fragment when it is registered.
- Table types come from the same barrel (`@chaibuilder/core/db/schema-sqlite`),
  independent of migrations — the drizzle instance stays fully typed either way.
- Releases that need a **data** migration (a backfill, not DDL) say so in the
  release notes with the migration body to drop into your migrations folder;
  `migrate:create` only generates schema diffs.

---

## Contributing

Contributions are welcome — bug reports, reproductions, docs, and code.

```bash
git clone https://github.com/chaibuilder/core.git
cd core
pnpm install
pnpm dev          # watch build (tsup)
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. The short version:
Node 22+ and pnpm, `main` is the only long-lived branch, and pull request titles must be
[conventional commits](https://www.conventionalcommits.org/) because they are squash-merged into
the changelog.

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md) — report vulnerabilities privately, never as an issue
- [Discussions](https://github.com/chaibuilder/core/discussions) for questions and ideas
- [Good first issues](https://github.com/chaibuilder/core/labels/good%20first%20issue)

### Repository notes

AI edit behavior is defined by the shared contracts and executors in
[`src/server/chai-actions/ai/ask-ai/`](src/server/chai-actions/ai/ask-ai/), with the tool contract
in `ai-edit-tool-contract.ts`. [AGENTS.md](AGENTS.md) maps the rest of the tree.

Besides being published to npm, this repo is vendored into host applications as a **git
subtree**, so code in `src/` must build standalone — never import from a host app
(`@/…`, `~~/…`, or relative paths that climb out of the repo). Use this repo's `~/`
alias. ESLint enforces this.

Sync is one-way: hosts pull, and contribute back by PR here. Host-side workflow:
[`scripts/RUNBOOK.md`](scripts/RUNBOOK.md), [`scripts/HOST-SETUP.md`](scripts/HOST-SETUP.md).

### Releases

Automated with [release-please](https://github.com/googleapis/release-please). Merging the
standing release pull request tags the version and publishes `@chaibuilder/core` to npm with provenance.
Nothing is published by hand.

---

## License

BSD 3-Clause. See [LICENSE](LICENSE).

---

## Links

- [chaibuilder.com](https://chaibuilder.com)
- [Documentation](https://chaibuilder.com/docs)
- [GitHub](https://github.com/chaibuilder/core)
- [Changelog](CHANGELOG.md)
