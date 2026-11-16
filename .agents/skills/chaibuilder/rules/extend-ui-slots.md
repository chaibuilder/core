---
title: Inject Components via Slots
impact: HIGH
tags: extend-ui, slots, registerChaiSlot, CHAI_SLOT_IDS
---

## Inject Components via Slots

Use `registerChaiSlot` with `CHAI_SLOT_IDS` constants to inject React components into specific locations in the builder UI.

**Correct:**

```ts
import { registerChaiSlot, CHAI_SLOT_IDS } from "@chaibuilder/core";

registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT, MyTopbarButton);
registerChaiSlot(CHAI_SLOT_IDS.AFTER_BLOCK_OPTIONS, ExtraBlockActions);

// SEO panel tab pair — register both trigger and content together
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

**Incorrect (string literal instead of constant):**

```ts
// ❌ typos won't be caught — always use CHAI_SLOT_IDS
registerChaiSlot("topbar-righ", MyButton);
```

**Rules:**

- Always use `CHAI_SLOT_IDS` constants, never raw strings — prevents typo bugs
- Multiple components can be registered per slot — all render by default
- On slots with `multiple: false`, only the **last registered** component renders
- `React.lazy` components are automatically wrapped in `<Suspense>`
- Errors inside slot components are caught by an `ErrorBoundary` — they won't crash the builder
