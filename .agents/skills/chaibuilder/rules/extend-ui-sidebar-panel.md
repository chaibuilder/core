---
title: Add a Custom Sidebar Panel
impact: HIGH
tags: extend-ui, sidebar, panel, registerChaiSidebarPanel
---

## Add a Custom Sidebar Panel

Use `registerChaiSidebarPanel` to add a custom panel to the builder sidebar. Panels can appear at the top or bottom of the sidebar and render in different view modes.

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

- Always call at module level, not inside a component or hook
- `position: "top"` groups with main nav icons; `"bottom"` appears below
- `view: "standard"` replaces the default side panel content area
- `view: "drawer" | "overlay" | "modal"` renders on top of the builder canvas
- Duplicate `panelId` logs a warning and overrides the previous registration
