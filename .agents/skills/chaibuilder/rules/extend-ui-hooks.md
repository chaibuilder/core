---
title: Lifecycle Hooks
impact: HIGH
tags: extend-ui, hooks, registerChaiHook, CHAI_HOOKS
---

## Lifecycle Hooks

Use `registerChaiHook` to intercept ChaiBuilder lifecycle events. Hooks run as a **pipeline** — each hook receives the output of the previous one.

**Correct:**

```ts
import { registerChaiHook, CHAI_HOOKS } from "@chaibuilder/core";

// Transform data before save
registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, async (pageData, context) => {
  // context: { pageId, operation, userId }
  return { ...pageData, updatedAt: Date.now() };
});

// Side-effect after save — return undefined to pass data through unchanged
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

**Incorrect (mutating data instead of returning new object):**

```ts
registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, (pageData) => {
  // ❌ mutation — return a new object instead
  pageData.updatedAt = Date.now();
});
```

**Rules:**

- Return a new object (don't mutate) to pass modified data to the next hook
- Return `undefined` to pass the current data through unchanged
- Errors are caught and logged — the pipeline continues with the last valid data
- Hooks execute in the order they were registered
