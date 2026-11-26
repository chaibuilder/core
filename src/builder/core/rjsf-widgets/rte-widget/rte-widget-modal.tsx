import { Editor } from "@tiptap/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { usePageExternalData } from "~/builder/atoms/builder";
import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

/**
 *
 * @param isOpen
 * @param onClose
 * @param editor
 * @param rteElement
 * @returns Full screen modal with rte editor
 */
const RTEModal = ({
  isOpen,
  onClose,
  editor,
  rteElement,
}: {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  rteElement: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const pageExternalData = usePageExternalData();

  const handlePathSelect = (path: string) => {
    if (!editor) return;

    // Create the placeholder
    const placeholder = `{{${path}}}`;

    // Focus the editor first
    editor.commands.focus();

    // Check if there's a selection
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    if (hasSelection) {
      // If there's a selection, replace it with the placeholder
      editor.chain().deleteSelection().insertContent(placeholder).run();
    } else {
      // No selection, just insert at cursor position
      // Get the text around the cursor to determine spacing
      const { state } = editor;
      const cursorPos = state.selection.from;

      // Get text before and after cursor for smart spacing
      const textBefore = state.doc.textBetween(Math.max(0, cursorPos - 1), cursorPos);
      const textAfter = state.doc.textBetween(cursorPos, Math.min(cursorPos + 1, state.doc.content.size));

      // Determine if we need spacing before the placeholder
      let prefix = "";
      if (cursorPos > 0 && textBefore !== " " && !/[.,!?;:]/.test(textBefore)) {
        prefix = " ";
      }

      // Determine if we need spacing after the placeholder
      let suffix = "";
      if (textAfter && textAfter !== " " && !/[.,!?;:]/.test(textAfter)) {
        suffix = " ";
      }

      // Insert the placeholder with smart spacing
      editor
        .chain()
        .insertContent(prefix + placeholder + suffix)
        .run();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>{t("Rich Text Editor")}</span>
            {pageExternalData && Object.keys(pageExternalData).length > 0 && (
              <div className="flex items-center">
                <span className="text-foreground/50 mr-2 text-xs">{t("Add field:")}</span>
                <div className="rte-path-selector">
                  <ChaiNestedPathSelector data={pageExternalData} onSelect={handlePathSelect} />
                </div>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        {rteElement}
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>{t("Done")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RTEModal;
