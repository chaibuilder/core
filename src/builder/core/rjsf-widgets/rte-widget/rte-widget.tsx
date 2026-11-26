import { WidgetProps } from "@rjsf/utils";
import { EditorContent } from "@tiptap/react";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { serializeRteHtml } from "~/builder/core/rjsf-widgets/binding-editor/binding-doc";
import { useBindingSuggestionItems } from "~/builder/core/rjsf-widgets/binding-editor/use-binding-suggestion-items";
import { useRTEditor } from "~/builder/core/rjsf-widgets/rte-widget/use-rte-editor";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useInlineEditing } from "~/builder/hooks/use-inline-editing";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { ChaiBlock } from "~/types/common";
import RteMenubar from "./rte-menu-bar";
const RTEModal = React.lazy(() => import("./rte-widget-modal"));

/**
 * Rich Text Editor Field Component
 */
const RichTextEditorFieldComp = ({ blockId, id, placeholder, value, onChange, onBlur }: WidgetProps) => {
  const { t } = useTranslation();
  const rteRef = useRef<HTMLDivElement & { __chaiRTE?: any; __chaiRTEGetValue?: () => string }>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  const { getItems, hasData } = useBindingSuggestionItems();
  const bindingEnabled = dataBindingEnabled && hasData;

  // With bindings on, serialize badge nodes back to literal `{{...}}` text instead of the
  // `<span data-chai-binding>` wrapper markup, so stored HTML keeps its existing format.
  const getValue = (ed?: typeof editor): string =>
    ed ? (bindingEnabled ? serializeRteHtml(ed) : ed.getHTML()) : "";

  const editor = useRTEditor({
    blockId,
    value,
    placeholder,
    getBindingItems: bindingEnabled ? getItems : undefined,
    onBlur: ({ editor }) => {
      onBlur(id, getValue(editor));
    },
    onUpdate: ({ editor }) => {
      onChange(getValue(editor));
    },
  });

  useEffect(() => {
    // This is critical for data binding to work - JSONForm.tsx looks for this property
    // to access the editor instance and insert data binding placeholders
    if (rteRef.current && editor) {
      rteRef.current.__chaiRTE = editor;
      rteRef.current.__chaiRTEGetValue = () => getValue(editor);
    }
  }, [blockId, editor, bindingEnabled]);

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const rteElement = (
    <div id={`chai-rte-${id}`} ref={rteRef} className="rounded-md border border-input">
      <RteMenubar editor={editor} onExpand={() => setIsModalOpen(true)} />
      <EditorContent
        key={id}
        editor={editor}
        id={id}
        placeholder={placeholder}
        className={`-mt-1 overflow-auto placeholder:font-light ${isModalOpen ? "max-h-[500px] min-h-[400px] rounded-b-md bg-background text-foreground" : "max-h-[200px] min-h-[80px] rounded-b-md bg-background text-foreground"}`}
      />
    </div>
  );

  return (
    <>
      {isModalOpen && (
        <Suspense fallback={<div>{t("Loading...")}</div>}>
          <RTEModal isOpen={isModalOpen} onClose={handleModalClose} editor={editor!} rteElement={rteElement} />
        </Suspense>
      )}
      {!isModalOpen ? <div className="relative">{rteElement}</div> : <div>{t("Open in modal")}</div>}
    </>
  );
};

const RichTextEditorField = (props: WidgetProps) => {
  const { editingBlockId } = useInlineEditing();
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const selectedBlock = useSelectedBlock() as ChaiBlock;
  const blockId = selectedBlock?._id;

  useEffect(() => {
    setCurrentBlockId(blockId);
  }, [blockId]);

  return currentBlockId && currentBlockId !== editingBlockId ? (
    <RichTextEditorFieldComp key={currentBlockId} {...props} blockId={currentBlockId} />
  ) : null;
};

export { RichTextEditorField as RTEField };

