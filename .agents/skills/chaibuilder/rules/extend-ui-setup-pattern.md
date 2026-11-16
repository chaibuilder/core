---
title: Setup Pattern — Centralise Registrations
impact: HIGH
tags: extend-ui, setup, client-only, ChaiWebsiteBuilder
---

## Setup Pattern — Centralise Registrations

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

**Incorrect (inline in component or server component):**

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

- `@chaibuilder/core` throws if imported in a server context — always in `"use client"` files or their non-async imports
- One `chai-setup.ts` file per project; import it exactly once at the editor entry point
- Register calls are idempotent per session but warn on duplicate IDs — don't call them inside loops or reactive code
