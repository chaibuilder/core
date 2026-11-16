const ELEMENT_NODE = 1;

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

/**
 * True when the event target is an active text-entry surface (text-like input,
 * textarea, contenteditable) where native/RTE editing behavior — undo, backspace,
 * typing — must take priority over builder-level shortcuts.
 */
export const isTextEntryTarget = (event: KeyboardEvent): boolean => {
  // `nodeType`, not `instanceof Element`: the canvas watcher listens on the iframe's document
  // while this module runs in the parent window, whose `Element` no canvas node is an instance of.
  const target = event.target as Element | null;
  if (target?.nodeType !== ELEMENT_NODE) return false;

  if (target.tagName === "TEXTAREA") return true;

  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type || "text";
    return TEXT_INPUT_TYPES.has(type);
  }

  if ((target as HTMLElement).isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;

  return false;
};
