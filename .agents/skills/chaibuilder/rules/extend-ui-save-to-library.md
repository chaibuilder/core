---
title: Custom Save to Library Dialog
impact: LOW
tags: extend-ui, save-to-library, registerChaiSaveToLibrary
---

## Custom Save to Library Dialog

Use `registerChaiSaveToLibrary` to replace the default "Save to Library" dialog with a custom component.

**Correct:**

```tsx
import { registerChaiSaveToLibrary } from "@chaibuilder/core";

registerChaiSaveToLibrary(({ blockId, blocks, close }) => (
  <MyLibraryDialog blockId={blockId} blocks={blocks} onClose={close} />
));
```

**Props received by your component:**

| Prop      | Type          | Description                   |
| --------- | ------------- | ----------------------------- |
| `blockId` | `string`      | ID of the block being saved   |
| `blocks`  | `ChaiBlock[]` | The block and its descendants |
| `close`   | `() => void`  | Call to close the dialog      |

**Rules:**

- Singleton — only one component can be registered; last call wins
