---
title: Feature Flags
impact: MEDIUM
tags: extend-ui, feature-flags, registerChaiFeatureFlag, useChaiFeatureFlag
---

## Feature Flags

Register toggleable flags that users can enable/disable inside the builder. State persists in `localStorage`.

**Registering flags:**

```ts
import { registerChaiFeatureFlag, registerChaiFeatureFlags } from "@chaibuilder/core";

// Single flag
registerChaiFeatureFlag("advanced-mode", {
  value: false,
  description: "Enable advanced editing features",
});

// Multiple at once
registerChaiFeatureFlags({
  "beta-ai": { description: "AI-powered suggestions" },
  "dark-canvas": { description: "Dark background on canvas" },
});
```

**Reading flags in components:**

```tsx
import { useChaiFeatureFlag, IfChaiFeatureFlag } from "@chaibuilder/core";

function MyComponent() {
  const isAdvanced = useChaiFeatureFlag("advanced-mode");
  return isAdvanced ? <AdvancedPanel /> : null;
}

// Declarative shorthand
<IfChaiFeatureFlag flagKey="advanced-mode">
  <AdvancedPanel />
</IfChaiFeatureFlag>;
```

**Rules:**

- Flag state is persisted in `localStorage` via jotai `atomWithStorage`
- Duplicate key logs a warning and overrides the previous registration
- Default `value` is `false` if not specified
