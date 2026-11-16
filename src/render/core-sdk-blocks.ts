// SDK-provided (structural / core) block types. Everything NOT in this list is
// treated as an app "custom" block and, when the app injects a
// `blockErrorBoundary`, gets wrapped so a throw during render degrades that one
// block to nothing instead of taking down the whole page.
//
// Core/structural blocks stay unwrapped on purpose: many hold children (a
// null-rendering fallback would drop the whole subtree), they are SDK-owned and
// rarely throw, and wrapping every Box/Column/Row would add a client error
// boundary around every structural node. Keep in sync with the SDK's own
// registered web-block types (see `src/web-blocks`).
export const CORE_SDK_BLOCKS = [
  "Box",
  "Button",
  "Heading",
  "Paragraph",
  "Text",
  "Span",
  "Link",
  "Image",
  "Video",
  "Icon",
  "List",
  "ListItem",
  "Row",
  "Column",
  "Form",
  "Input",
  "FormButton",
  "Checkbox",
  "Radio",
  "Select",
  "TextArea",
  "Label",
  "RichText",
  "Divider",
  "EmptyBox",
  "LineBreak",
  "Table",
  "TableBody",
  "TableHead",
  "TableRow",
  "TableCell",
  "EmptySlot",
  "CustomHTML",
  "CustomScript",
  "GlobalBlock",
  "PartialBlock",
  "Repeater",
  "RepeaterItem",
  "RepeaterEmptyState",
  "ChaiSlot",
  "CollectionItem",
];
