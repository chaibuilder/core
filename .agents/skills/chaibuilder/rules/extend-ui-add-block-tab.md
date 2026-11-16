---
title: Add Block Tab
impact: MEDIUM
tags: extend-ui, add-block, registerChaiAddBlockTab
---

## Add Block Tab

Use `registerChaiAddBlockTab` to inject a custom tab (with its content panel) into the "Add Block" drawer.

**Correct:**

```tsx
import { registerChaiAddBlockTab } from "@chaibuilder/core";

registerChaiAddBlockTab("my-templates", {
  tab: () => <span>Templates</span>, // tab button / label
  tabContent: MyTemplatesPanel, // panel rendered when tab is active
});
```

**Rules:**

- `tab` — the clickable tab trigger component
- `tabContent` — the panel content shown when the tab is selected
- Duplicate `id` logs a warning and overrides the previous registration
