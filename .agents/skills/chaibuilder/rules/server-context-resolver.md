---
title: Request Context — createChaiBuilder
impact: HIGH
tags: server, createChaiBuilder, getChaiBuilder, ChaiContextResolver, ChaiRequestContext, permissions, delegatedPermissions, route, page, server-actions
---

## Request Context — createChaiBuilder

Every ChaiBuilder request needs one envelope of facts, the `ChaiRequestContext`:

| Group     | Fields                                                  | Answers                         |
| --------- | ------------------------------------------------------- | ------------------------------- |
| **WHERE** | `appId`, `siteUrl`                                      | which tenant / which site       |
| **WHO**   | `userId`, `role`, `permissions`, `delegatedPermissions` | who is asking, and may they     |
| **HOW**   | `draft`, `lang`                                         | which content, in what language |

ChaiBuilder cannot work these out for you: auth, tenancy, and site URL are host decisions. So you write one resolver and hand it to `createChaiBuilder`, which gives back the `getChaiBuilder` your entry points call.

**Why not put the resolver in `chaibuilder.config.ts`?** The resolver usually needs framework APIs (`next/headers`, your session library). The config must stay plain data that seed scripts and CI can import. Keeping them in separate files is what makes both possible.

---

### Step 1 — Create the handle once

```ts
// chaibuilder.server.ts  (root of the project — not inside pro/)
import config from "@/chaibuilder.config";
import { cookies, draftMode } from "next/headers";
import { createChaiBuilder, type ChaiIncomingRequest } from "@chaibuilder/core/server";

/** Route handlers: identity from the Authorization header. */
async function userIdFromRequest(request: ChaiIncomingRequest): Promise<string | null> {
  const token = (request.headers.get("authorization") ?? "").split(" ")[1];
  if (!token) return null;
  const user = await verifyJwt(token); // your auth library
  return user?.id ?? null;
}

/** Server components + server actions: identity from auth cookies. */
async function userIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = await getSessionFromCookies(cookieStore); // your auth library
  return session?.userId ?? null;
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

The resolver runs once per request. Return only what you own — every field has a documented default.

**`request` presence by call site:**

| Context                    | `request`        | Identity source                |
| -------------------------- | ---------------- | ------------------------------ |
| Route handler (`route.ts`) | ✅ `NextRequest` | `Authorization: Bearer` header |
| Page / layout (`page.tsx`) | ❌ `undefined`   | `next/headers` cookies         |
| Server action              | ❌ `undefined`   | `next/headers` cookies         |
| Outside Next.js (scripts)  | ❌ `undefined`   | env vars / hardcoded           |

---

### Step 2 — Import `getChaiBuilder` in every entry point

`getChaiBuilder` is bound to your config and resolver, so importing it is what wires them up. There is no side-effect import to remember.

**1. Route handler (`route.ts`)** — pass the request so the resolver can read its headers:

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

**2. Page / layout (`page.tsx`)** — pass route props; the resolver reads cookies itself:

```tsx
// app/(public)/[[...slug]]/page.tsx
import { getChaiBuilder } from "@/chaibuilder.server";

export default async function Page(props) {
  const cb = await getChaiBuilder(props);
  const payload = await cb.getPagePayload(slug);
  return <RenderChaiBlocks {...payload} />;
}
```

**3. Server action / sitemap / custom layout** — no arguments; reuses the context already resolved for this request:

```ts
"use server";
import { getChaiBuilder } from "@/chaibuilder.server";

export async function saveSettings(data: unknown) {
  const cb = await getChaiBuilder();
  // ... use cb
}
```

**4. Outside Next.js (seed scripts, CLI tools)** — same factory, minus the framework APIs:

```ts
// scripts/seed.ts
import config from "../chaibuilder.config";
import { createChaiBuilder } from "@chaibuilder/core/server";

const { getChaiBuilder } = createChaiBuilder(config, {
  context: async () => ({
    appId: process.env.CHAIBUILDER_APP_KEY ?? "",
    userId: "seed-script",
    draft: false,
  }),
});

const cb = await getChaiBuilder();
await cb.seedPages();
```

Omit `context` entirely and ChaiBuilder falls back to a static context from `CHAIBUILDER_API_KEY` / `CHAIBUILDER_APP_KEY` and `SITE_URL` — never touching `next/headers`.

---

### Permissions — the resolver decides

The resolver is the only place authorization is decided. Whatever it puts on `permissions` is what the server enforces and what the builder UI gates on — no action can widen or narrow it.

```ts
// Let ChaiBuilder answer from its own app_users table (role expanded into permissions):
const access = userId ? await resolveChaiAppUserAccess({ appId, userId }) : null;
return { appId, userId, ...(access ?? {}) };

// ...or answer it yourself, from wherever the host models access:
return { appId, userId, role: "editor", permissions: ["pages:*", "assets:read"] };
```

Permission keys are `entity:operation` (`pages:read`, `assets:update`), with `*` and `entity:*` wildcards.

- a list → the user's grants. `[]` means authenticated with none.
- `undefined` / `null` → not a member: authenticated actions fail 401.

**Delegation** — `delegatedPermissions` is the ceiling for the _credential_, independent of the user behind it. Effective permissions become `permissions ∩ delegatedPermissions`. Use it for OAuth apps, MCP tokens, and scoped API keys:

```ts
// An admin's token, but the token was only granted page reads.
{ userId, role: "admin", permissions: ["*"], delegatedPermissions: ["pages:read"] }
// → effective: pages:read only. Everything else is 403.
```

Omit it (or pass `null`) for normal browser requests — no clamp. `[]` permits nothing. Prefer concrete keys over wildcards in delegated lists: a host-defined key matched only by a wildcard on both sides is not intersectable.

### `CHECK_USER_ACCESS` reports; it does not decide

The builder UI calls it to learn what to gate. It returns what the resolver decided. Overriding it changes only what the client is told — the server still enforces the resolver's answer — so put your logic in the resolver, not here.

---

### `ChaiRequestContext` — what the resolver returns

```ts
type ChaiRequestContext = {
  appId: string; // auto-filled from CHAIBUILDER_API_KEY / CHAIBUILDER_APP_KEY if omitted
  userId?: string | null;
  role?: string | null; // reported with permissions; defaults to "custom"
  permissions?: string[] | null; // the authz decision; omit/null → not a member (401)
  delegatedPermissions?: string[] | null; // credential ceiling; omit → no clamp
  draft?: boolean;
  siteUrl?: string | null;
  lang?: string;
};
```

---

### Rules

- Create the handle in one file (e.g. `chaibuilder.server.ts`) and import `getChaiBuilder` from it everywhere — never re-create it per route
- `getChaiBuilder(props, request)` in route handlers, `getChaiBuilder(props)` in pages/layouts/`generateMetadata`, `getChaiBuilder()` everywhere else
- `request` is `undefined` in pages, layouts, and server actions — always branch on `if (request)` and fall back to `next/headers`
- `draftMode()` from `next/headers` works in both route handlers and server components in Next.js 15+
- Outside Next.js: never call `next/headers` — use a plain async function returning static values
- Creating the handle again replaces the resolver (last one wins) — a dev-server hot reload re-registers an equivalent one, which is harmless

### Legacy — `setChaiContextResolver`

The previous API still works and is what the factory calls internally:

```ts
setChaiContextResolver(async ({ request }) => ({ ... })); // deprecated
```

It registered the resolver as a _side effect_ of importing the module, so every entry point needed `import "@/chai-context";` and forgetting it in one route silently downgraded that route to the env-only context. `createChaiBuilder` closes that hole: `getChaiBuilder` cannot be imported without the resolver coming with it. Migrate by moving the resolver body into `createChaiBuilder(config, { context })` and replacing each `getChaiBuilder(config, props, request)` call with `getChaiBuilder(props, request)`.
