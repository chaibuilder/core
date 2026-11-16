import { getDefaultRegistry } from "@rjsf/core";
import { WidgetProps } from "@rjsf/utils";
import { EditorContent } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { cn } from "~/lib/utils";
import { ChaiBlock } from "~/types/common";
import { serializePlainDoc, toBindingString } from "./binding-doc";
import { useBindingEditor } from "./use-binding-editor";
import { useBindingSuggestionItems } from "./use-binding-suggestion-items";

const { TextWidget: DefaultTextWidget, TextareaWidget: DefaultTextareaWidget } = getDefaultRegistry().widgets;

/**
 * A binding field is only wired to a *string* schema without an enum/oneOf, that has not
 * opted out (`binding === false`), when data binding is enabled and page external data
 * exists. Everything else falls back to the stock rjsf widget so number/email/enum fields
 * are untouched.
 */
const shouldUseBindingEditor = (schema: any, dataBindingEnabled: boolean, hasData: boolean): boolean => {
  if (!dataBindingEnabled || !hasData) return false;
  if (schema?.type !== "string") return false;
  if (schema?.enum || schema?.oneOf || schema?.anyOf) return false;
  if (schema?.binding === false) return false;
  return true;
};

type BindingTextFieldProps = {
  id: string;
  /** RJSF / block props can be non-string at runtime; coerced via `toBindingString`. */
  value: unknown;
  placeholder?: string;
  multiline?: boolean;
  /** Extra classes for the bordered container (e.g. custom height). */
  className?: string;
  /** Override the suggestion data source (e.g. the SEO panel's own page data). */
  externalData?: Record<string, any>;
  /** When false, the editor is read-only. */
  editable?: boolean;
  /** Multiline only: min height in px, replacing the default 60px floor (e.g. a `rows` count). */
  minHeight?: number;
  /** Trap Tab/Shift-Tab to indent/unindent by two spaces instead of moving focus (JSON editing). */
  indentWithTab?: boolean;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
};

/**
 * Reusable single/multi-line tiptap editor that renders `{{...}}` bindings as badges and
 * fires the `{{` suggestion dropdown. Used by the rjsf Text/Textarea widgets and by any
 * other binding-capable input (e.g. the image URL field).
 */
export const BindingTextField = ({
  id,
  value,
  placeholder,
  multiline = false,
  className,
  externalData,
  editable = true,
  minHeight,
  indentWithTab,
  onChange,
  onBlur,
}: BindingTextFieldProps) => {
  const selectedBlock = useSelectedBlock() as ChaiBlock;
  // For non-block-scoped surfaces (SEO panel, which passes its own `externalData`), key the
  // editor by `id` only. Otherwise a change in the selected canvas block would recreate the
  // editor mid-typing (losing caret/undo/history).
  const blockId = externalData ? id : (selectedBlock?._id ?? id);
  const { getItems, rootData } = useBindingSuggestionItems(externalData);
  const { selectedLang, fallbackLang } = useLanguages();
  const containerRef = useRef<HTMLDivElement & { __chaiRTE?: any; __chaiRTEGetValue?: () => string }>(null);
  const stringValue = toBindingString(value);

  const editor = useBindingEditor({
    id,
    blockId,
    value: stringValue,
    placeholder,
    multiline,
    editable,
    bindingData: rootData,
    locale: selectedLang || fallbackLang || "en",
    minHeight,
    indentWithTab,
    getItems,
    onChange,
    onBlur,
  });

  // Expose the editor via the `__chaiRTE` protocol so the DataBindingSelector "+" button
  // inserts into this editor, and `__chaiRTEGetValue` returns the serialized plain string
  // (not HTML) for its onChange echo.
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.__chaiRTE = editor;
    containerRef.current.__chaiRTEGetValue = () => (editor ? serializePlainDoc(editor.getJSON()) : stringValue);
  }, [editor, stringValue]);

  return (
    <div
      id={`chai-rte-${id}`}
      ref={containerRef}
      className={cn(
        // `relative` is required so the placeholder's absolutely-positioned ::before
        // stays inside the field instead of escaping over the label above.
        // `min-w-0 max-w-full` stops nowrap content (a badge at the line end) from forcing
        // the whole settings panel wider — it clips/scrolls internally like a real input.
        "border-input text-foreground relative w-full max-w-full min-w-0 overflow-hidden rounded-md border bg-surface outline-none focus-within:ring-0 focus-within:outline-none focus:outline-none",
        multiline ? "min-h-[60px]" : "min-h-8",
        className,
      )}>
      <EditorContent
        editor={editor}
        id={id}
        className="w-0 max-w-full min-w-full outline-none focus:outline-none focus-visible:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:focus-visible:outline-none"
      />
    </div>
  );
};

const BindingEditorInner = ({ props, multiline }: { props: WidgetProps; multiline: boolean }) => {
  const { id, value, placeholder, onChange, onBlur } = props;
  return (
    <BindingTextField
      id={id}
      value={value}
      placeholder={placeholder}
      multiline={multiline}
      onChange={onChange}
      onBlur={(serialized) => onBlur(id, serialized)}
    />
  );
};

/**
 * Binding-capable text input that falls back to a plain input renderer when data binding
 * is disabled or no page data is available. Used by custom widgets (image URL, ...) that
 * are not plain rjsf string fields.
 */
export const useBindingInputEnabled = (externalDataOverride?: Record<string, any>): boolean => {
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  const { hasData } = useBindingSuggestionItems(externalDataOverride);
  return dataBindingEnabled && hasData;
};

export const BindingInputWidget = (props: WidgetProps) => {
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  const { hasData } = useBindingSuggestionItems();
  if (!shouldUseBindingEditor(props.schema, dataBindingEnabled, hasData)) {
    return <DefaultTextWidget {...props} />;
  }
  return <BindingEditorInner props={props} multiline={false} />;
};

export const BindingTextareaWidget = (props: WidgetProps) => {
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  const { hasData } = useBindingSuggestionItems();
  if (!shouldUseBindingEditor(props.schema, dataBindingEnabled, hasData)) {
    return <DefaultTextareaWidget {...props} />;
  }
  return <BindingEditorInner props={props} multiline={true} />;
};
