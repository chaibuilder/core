import Placeholder from "@tiptap/extension-placeholder";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Extension, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { parseMultiline, parseSingleLine, serializePlainDoc, toBindingString } from "./binding-doc";
import { ChaiBindingNode } from "./binding-node";
import { createBindingSuggestionExtension, isBindingSuggestionActive } from "./binding-suggestion";
import type { BindingSuggestionItem } from "./use-binding-suggestion-items";

// Blocks Enter/Shift-Enter in the single-line editor so it stays one paragraph.
const NoNewline = Extension.create({
  name: "chaiBindingNoNewline",
  addKeyboardShortcuts() {
    return { Enter: () => true, "Shift-Enter": () => true };
  },
});

const INDENT = "  ";

/** Leading indent spaces (max one level) at the start of a paragraph. */
const leadingIndent = (node: ProseMirrorNode): number => {
  const first = node.firstChild;
  if (!first?.isText || !first.text) return 0;
  return first.text.match(/^ {1,2}/)?.[0].length ?? 0;
};

/**
 * Tab/Shift-Tab indentation, keeping the contract of the textarea this editor replaces in
 * the JSON field: Tab inserts two spaces (or indents every line the selection touches)
 * instead of moving focus out of the field, Shift-Tab strips them back off.
 */
const indentSelection = (editor: Editor, outdent: boolean): boolean => {
  const { state } = editor;
  // While the `{{` dropdown is open Tab means "accept the highlighted field"; leave the key
  // to the suggestion plugin instead of racing it on plugin order.
  if (isBindingSuggestionActive(state)) return false;
  const { from, to, empty } = state.selection;
  if (empty && !outdent) {
    editor.view.dispatch(state.tr.insertText(INDENT));
    return true;
  }

  const { tr } = state;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "paragraph") return;
    // Positions come from the untouched doc, so remap them through the steps applied so far.
    const lineStart = tr.mapping.map(pos + 1);
    if (!outdent) {
      tr.insertText(INDENT, lineStart);
      return;
    }
    const indent = leadingIndent(node);
    if (indent) tr.delete(lineStart, lineStart + indent);
  });
  // Nothing to outdent still swallows the key — Tab must not escape the field mid-edit.
  if (!tr.docChanged) return true;
  editor.view.dispatch(tr);
  return true;
};

export const IndentWithTab = Extension.create({
  name: "chaiBindingIndentWithTab",
  addKeyboardShortcuts() {
    return {
      Tab: () => indentSelection(this.editor, false),
      "Shift-Tab": () => indentSelection(this.editor, true),
    };
  },
});

const buildStarterKit = (multiline: boolean) =>
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    bold: false,
    italic: false,
    strike: false,
    code: false,
    ...(multiline ? {} : { hardBreak: false }),
    dropcursor: false,
    gapcursor: false,
  } as any);

type UseBindingEditorArgs = {
  id: string;
  blockId: string;
  value: unknown;
  placeholder?: string;
  multiline: boolean;
  editable?: boolean;
  bindingData: Record<string, any>;
  locale?: string;
  /** Multiline only: min height in px, replacing the default 60px floor. */
  minHeight?: number;
  /** Trap Tab/Shift-Tab to indent/unindent instead of moving focus (JSON editing). */
  indentWithTab?: boolean;
  getItems: (query: string) => BindingSuggestionItem[];
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
};

export const useBindingEditor = ({
  id,
  blockId,
  value,
  placeholder,
  multiline,
  editable = true,
  bindingData,
  locale = "en",
  minHeight,
  indentWithTab = false,
  getItems,
  onChange,
  onBlur,
}: UseBindingEditorArgs) => {
  const getItemsRef = useRef(getItems);
  getItemsRef.current = getItems;
  const bindingDataRef = useRef(bindingData);
  bindingDataRef.current = bindingData;
  const stringValue = toBindingString(value);
  const valueRef = useRef(stringValue);
  valueRef.current = stringValue;

  const serialize = (json: any): string => {
    const out = serializePlainDoc(json);
    return multiline ? out : out.replace(/\n/g, " ");
  };

  const editor = useEditor(
    {
      extensions: [
        buildStarterKit(multiline),
        ...(multiline ? [] : [NoNewline]),
        ...(indentWithTab ? [IndentWithTab] : []),
        ChaiBindingNode.configure({ getData: () => bindingDataRef.current, locale }),
        createBindingSuggestionExtension((query) => getItemsRef.current(query)),
        Placeholder.configure({
          placeholder: placeholder || "",
          // `float-left h-0` keeps the placeholder in normal flow (no absolute
          // positioning that could escape the field), matching tiptap's default recipe.
          emptyEditorClass:
            "cursor-text before:pointer-events-none before:float-left before:h-0 before:opacity-50 before:content-[attr(data-placeholder)]",
        }),
      ],
      editable,
      content: multiline ? parseMultiline(stringValue) : parseSingleLine(stringValue),
      editorProps: {
        attributes: {
          // `!min-h-*` overrides the global unlayered `.ProseMirror { min-height: 100px }`
          // rule (which would otherwise make every single-line input as tall as a textarea).
          // `[&_p]:m-0` neutralizes any global paragraph margin.
          class: multiline
            ? `${minHeight ? "" : "!min-h-[60px] "}w-full min-w-0 max-w-full px-3 py-2 text-xs leading-normal outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&_p]:m-0 bg-surface`
            : "!min-h-0 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap px-3 py-1.5 text-xs leading-normal outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&_p]:m-0 [&_p]:whitespace-nowrap bg-surface",
          // A caller-supplied height is dynamic (rows -> px), so it cannot be a Tailwind
          // class; the `!min-h-*` class above is dropped so this inline style is the winner.
          ...(multiline && minHeight ? { style: `min-height: ${minHeight}px` } : {}),
        },
        // These are plain-value fields (input/textarea/url/svg). Paste as plain text so
        // pasted HTML/SVG code is kept verbatim (not parsed into rich nodes); `{{...}}` in
        // the pasted text is then badged by the tokenizer. Single-line collapses newlines.
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (!text) return false;
          const { from, to } = view.state.selection;
          view.dispatch(view.state.tr.insertText(multiline ? text : text.replace(/\r?\n/g, " "), from, to));
          return true;
        },
      },
      // Only report a real change: tiptap also fires on mount, and echoing the
      // shown value back writes it to the block — an empty field would then save
      // "" over the stored value (e.g. a form remounting on a language switch).
      onUpdate: ({ editor }) => {
        const next = serialize(editor.getJSON());
        if (next !== valueRef.current) onChange(next);
      },
      onBlur: ({ editor }) => onBlur?.(serialize(editor.getJSON())),
    },
    [blockId, id, locale, minHeight, indentWithTab],
  );

  // Sync external value changes (undo/redo, cross-field writes) without stealing the caret.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    // setContent rebuilds every node view; doing that while a badge's formatter
    // popover is open unmounts its trigger and kills the popover mid-edit (e.g.
    // an autosave refetch landing right after the user clicks a badge).
    if (editor.view.dom.querySelector('button[data-state="open"]')) return;
    const current = serialize(editor.getJSON());
    if (current === stringValue) return;
    editor.commands.setContent(multiline ? parseMultiline(stringValue) : parseSingleLine(stringValue), false);
  }, [stringValue, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return editor;
};
