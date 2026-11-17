import { useThrottledCallback } from "@react-hookz/web";
import { get } from "lodash-es";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatHtml } from "~/builder/core/modals/domToJsx";
import { useCodeEditor } from "~/builder/hooks/use-code-editor";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useUpdateBlocksProps, useUpdateBlocksPropsRealtime } from "~/builder/hooks/use-update-blocks-props";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";

/**
 * Try to fix the HTML code
 * @param html
 */
const sanitizeHTML = (html: string) => {
  const doc = document.createElement("div");
  doc.innerHTML = html;
  return doc.innerHTML;
};

export default function CodeEditor() {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  const [codeEditor, setCodeEditor] = useCodeEditor();
  const [code, setCode] = useState(codeEditor?.initialCode || "");
  const [ids] = useSelectedBlockIds();
  const updateBlockProps = useUpdateBlocksProps();
  const updateRealTime = useUpdateBlocksPropsRealtime();
  const { selectedLang } = useLanguages();
  const currentLanguage = useMemo(() => get(CHAI_LANGUAGES, selectedLang, selectedLang), [selectedLang]);
  const saveCodeContentRealTime = useThrottledCallback(
    (value: string) => {
      if (!codeEditor) return;
      const html = sanitizeHTML(value);
      updateRealTime([codeEditor.blockId], { [codeEditor.blockProp]: html });
    },
    [],
    300,
  );

  const saveCodeContent = useCallback(() => {
    if (dirty && codeEditor) {
      const html = sanitizeHTML(code);
      updateBlockProps([codeEditor.blockId], { [codeEditor.blockProp]: html });
    }
  }, [dirty, codeEditor, code, updateBlockProps]);

  useEffect(() => {
    if (codeEditor && !ids.includes(codeEditor.blockId)) {
      saveCodeContent();
      setCodeEditor(null);
    }
  }, [ids, codeEditor, saveCodeContent, setCodeEditor]);

  const handleClose = () => {
    saveCodeContent();
    setCodeEditor(null);
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="flex max-w-5xl flex-col gap-0 space-y-0 p-0">
        <DialogHeader className="border-border shrink-0 border-b px-4 py-2">
          <DialogTitle className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t("HTML Code Editor")}</h3>
              <div className="text-muted-foreground flex items-center space-x-2 text-xs font-light">
                {currentLanguage && <span className="bg-muted rounded px-1.5 py-0.5">{currentLanguage}</span>}
                <span>{t("Scripts will be only executed in preview and live mode.")}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="text-foreground flex-1 overflow-hidden p-0">
          <Textarea
            value={codeEditor ? formatHtml(code) : ""}
            onChange={(e) => {
              const value = e.target.value;
              setDirty(true);
              setCode(value);
              saveCodeContentRealTime(value);
            }}
            className="min-h-[450px] border-none font-extralight"
            placeholder="<!-- Enter your HTML code here -->"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
