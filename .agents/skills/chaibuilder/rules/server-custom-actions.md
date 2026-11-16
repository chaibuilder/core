---
title: Custom Server Actions
impact: HIGH
tags: server, ChaiBaseAction, actions, initChaiActionHandler, dispatchChaiAction
---

## Custom Server Actions

Extend ChaiBuilder's server-side behaviour by registering custom actions. Actions are classes that extend `ChaiBaseAction`.

**1. Define an action:**

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
    // fetch user record and verify they belong to appId
    const user = await db.query.users.findFirst({
      where: (u) => eq(u.id, userId!) && eq(u.appId, appId),
    });
    if (!user) return { access: false };
    return { access: true, role: user.role, permissions: user.permissions };
  }
}
```

**2. Register actions in config:**

```ts
// chaibuilder.config.ts
import { buildChaiBuilderConfig } from "@chaibuilder/core/server";
import { CheckUserAccessAction } from "./src/app/(builder)/api/actions/check-user-access";

export const chaiConfig = buildChaiBuilderConfig({
  db,
  actions: {
    CHECK_USER_ACCESS: new CheckUserAccessAction(),
    // ...other actions
  },
});
```

**3. Wire up the HTTP handler (route.ts):**

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

**`ChaiBaseAction` contract:**

```ts
abstract class ChaiBaseAction<TInput = any, TOutput = any> {
  context: ChaiActionContext | null; // set by dispatcher before execute()
  requiredPermission?: ChaiRequiredPermission; // string | fn — undefined = auth only
  protected getValidationSchema(): ZodType; // override to validate input
  abstract execute(data: TInput): Promise<TOutput>;
}
```

**`ChaiActionContext` fields available in `this.context`:**

| Field             | Type                    | Description                      |
| ----------------- | ----------------------- | -------------------------------- |
| `appId`           | `string`                | ChaiBuilder app/site ID          |
| `userId`          | `string \| undefined`   | Authenticated user ID            |
| `userAccess`      | `{ role, permissions }` | Resolved user role + permissions |
| `action`          | `string`                | The action name being dispatched |
| `delegatedScopes` | `string[] \| null`      | MCP-scoped permission clamp      |

**Dispatching actions programmatically:**

```ts
import { dispatchChaiAction, tryChaiAction } from "@chaibuilder/core/server";

// throws on error
const result = await dispatchChaiAction("MY_ACTION", { key: "value" });

// returns { ok: true, data } | { ok: false, error }
const result = await tryChaiAction("MY_ACTION", { key: "value" });
```

**Rules:**

- `CHECK_USER_ACCESS` action is **required** — without it, authenticated actions will throw
- Action names are UPPER_SNAKE_CASE by convention
- `this.context` is always set before `execute()` — safe to use without null-checks after `super.run()`
- `requiredPermission` is enforced before `execute()` — throw `ActionError` for business-logic failures
