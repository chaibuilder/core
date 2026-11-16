import { BubbleMenu, EditorContent } from "@tiptap/react";
import { memo, useEffect, useMemo } from "react";
import { useFrame } from "~/builder/core/frame/frame-context";
import RteMenubar from "~/builder/core/rjsf-widgets/rte-widget/rte-menu-bar";
import { useRTEditor } from "~/builder/core/rjsf-widgets/rte-widget/use-rte-editor";

function getInitialTextAlign(element: HTMLElement) {
  let el = element as HTMLElement | null;
  while (el) {
    if (el.style && el.style.textAlign) {
      return el.style.textAlign;
    }
    const computed = window.getComputedStyle(el).textAlign;
    if (computed && computed !== "start" && computed !== "initial" && computed !== "inherit") {
      return computed;
    }
    el = el.parentElement as HTMLElement | null;
  }
  return null;
}
/**
 * @description This is the editor that is used to edit the block content
 * It is memoized to prevent unnecessary re-renders
 * Editor for : RichText
 */
const RichTextEditor = memo(
  ({
    blockContent,
    editingElement,
    onClose,
    onChange,
    onEscape,
  }: {
    blockContent: string;
    editingElement: HTMLElement;
    onClose: (content: string) => void;
    onChange: (content: string) => void;
    onEscape: (e: KeyboardEvent, content?: string) => void;
  }) => {
    const { document } = useFrame();

    const editor = useRTEditor({
      value: blockContent,
      blockId: "active-inline-editing-element",
      placeholder: "Enter text here",
      onUpdate: ({ editor }) => onChange(editor?.getHTML() || ""),
      onBlur: ({ editor, event }) => {
        if (!document) return;
        // Only close if clicked outside both editor and bubble menu
        const target = event?.relatedTarget as HTMLElement;
        const editorElement = document.querySelector(".ProseMirror");
        const bubbleMenu = document.querySelector(".tippy-box");
        const menuBar = document.querySelector("#chai-rich-text-menu-bar");
        // Menu-bar dropdowns (link form, color picker) are portalled out of the bubble menu.
        const menuDropdown = document.querySelector("#chaibuilder-rte-dropdown-menu-content");

        const isEditorClicked = editorElement?.contains(target);
        const isBubbleMenuClicked = bubbleMenu?.contains(target);
        const isMenuBarClicked = menuBar?.contains(target);
        const isMenuDropdownClicked = menuDropdown?.contains(target);
        const isColorPickerOpen = window.document.getElementById("rte-widget-color-picker");

        // Check if click was outside both editor and bubble menu
        if (
          !isEditorClicked &&
          !isBubbleMenuClicked &&
          !isMenuBarClicked &&
          !isMenuDropdownClicked &&
          !isColorPickerOpen
        ) {
          const content = editor?.getHTML() || "";
          onClose(content);
        }
      },
      from: "canvas",
    });

    useEffect(() => {
      // * Setting text alignment
      const textAlign = getInitialTextAlign(editingElement);
      if (textAlign) editor?.commands?.setTextAlign(textAlign);

      editor?.commands?.focus();
      editor?.emit("focus", {
        editor,
        event: new FocusEvent("focus"),
        transaction: [] as any,
      });
    }, [editingElement, editor]);

    const editorClassName = useMemo(() => {
      const basicClassName = "max-w-none shadow-none outline outline-[2px] [&_*]:shadow-none";
      if (!editingElement) return basicClassName;

      const editingElementClassName = editingElement?.className?.replace("sr-only", "") || "";
      return `${basicClassName} ${editingElementClassName}`;
    }, [editingElement]);

    const onKeyDown: any = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // This handler sits on both the wrapper div and EditorContent — stop
        // propagation so one Escape doesn't invoke onEscape twice
        e.stopPropagation();
        // Pass the current content — the wrapper's editorRef is not used by the
        // tiptap editor, so closing without it would commit undefined
        onEscape(e, editor?.getHTML() || "");
      }
    };

    return (
      editor && (
        <div onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} className="relative">
          <BubbleMenu
            editor={editor}
            shouldShow={() => editor && editor?.isFocused}
            tippyOptions={{ duration: 100, arrow: true, hideOnClick: false }}
            className="w-max">
            <RteMenubar editor={editor} from="canvas" />
          </BubbleMenu>
          <EditorContent
            id="active-inline-editing-element"
            onKeyDown={onKeyDown}
            value={blockContent}
            editor={editor}
            className={editorClassName}
          />
        </div>
      )
    );
  },
);
RichTextEditor.displayName = "RichTextEditor";

export default RichTextEditor;
