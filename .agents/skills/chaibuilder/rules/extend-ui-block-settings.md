---
title: Custom Block Setting Widgets, Fields, and Templates
impact: MEDIUM
tags: extend-ui, block-settings, rjsf, registerChaiBlockSettingWidget
---

## Custom Block Setting Widgets, Fields, and Templates

Extend the block settings form (RJSF-based) with custom UI. Reference your registered widget/field by key in a block's `uiSchema`.

**Register custom RJSF extensions:**

```ts
import {
  registerChaiBlockSettingWidget,
  registerChaiBlockSettingField,
  registerChaiBlockSettingTemplate,
} from "@chaibuilder/core";

// Widget — maps to uiSchema "ui:widget"
registerChaiBlockSettingWidget("color-picker", ColorPickerWidget);

// Field — maps to uiSchema "ui:field"
registerChaiBlockSettingField("icon-selector", IconSelectorField);

// Template — maps to uiSchema "ui:FieldTemplate" etc.
registerChaiBlockSettingTemplate("inline-label", InlineLabelTemplate);
```

**Reference in a block's props schema:**

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

- Widget, field, and template IDs are global — use namespaced keys to avoid collisions (e.g. `"myapp-color-picker"`)
- The `ui` key on a prop's schema becomes the `uiSchema` entry for that field
