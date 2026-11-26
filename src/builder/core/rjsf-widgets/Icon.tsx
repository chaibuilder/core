import { WidgetProps } from "@rjsf/utils";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { BindingTextField, useBindingInputEnabled } from "./binding-editor/binding-editor-widget";

const IconPicker = lazy(() => import("./IconPicker").then((module) => ({ default: module.IconPicker })));

const sanitizeSvg = (svgString: string): string => {
  try {
    // Remove width and height attributes
    let cleaned = svgString
      .replace(/<svg([^>]*)\sheight="[^"]*"([^>]*)>/gi, "<svg$1$2>")
      .replace(/<svg([^>]*)\swidth="[^"]*"([^>]*)>/gi, "<svg$1$2>");

    // Remove extra whitespace between tags
    cleaned = cleaned.replace(/>\s+</g, "><");

    // Remove newlines and extra spaces
    cleaned = cleaned.replace(/\n/g, "").replace(/\s{2,}/g, " ");

    // Trim spaces around attributes
    cleaned = cleaned.replace(/\s+=/g, "=").replace(/=\s+/g, "=");

    // Remove comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

    return cleaned.trim();
  } catch {
    return svgString;
  }
};

const IconPickerField = ({ value, onChange, id }: WidgetProps) => {
  const { t } = useTranslation();
  const [svgInput, setSvgInput] = useState(value || "");
  const bindingInputEnabled = useBindingInputEnabled();

  const handleSvgChange = (newSvg: string) => {
    setSvgInput(newSvg);
    const sanitized = sanitizeSvg(newSvg);
    onChange(sanitized);
  };

  return (
    <div className="mt-1 flex items-start gap-x-2" id="icon-picker-field">
      <div className="flex w-[72px] shrink-0 flex-col gap-1">
        <div className="bg-surface/50 flex h-9 w-full items-center justify-center overflow-hidden rounded-md border border-input text-muted-foreground">
          {svgInput ? (
            <div className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgInput }} />
          ) : (
            <span className="text-[10px] text-muted-foreground">{t("SVG")}</span>
          )}
        </div>
        <Suspense fallback={<div className="h-6 text-[10px] text-muted-foreground">{t("Loading...")}</div>}>
          <IconPicker onSelectIcon={handleSvgChange} />
        </Suspense>
      </div>
      {bindingInputEnabled ? (
        <BindingTextField
          id={id}
          multiline
          className="h-[64px] min-h-0 flex-1 overflow-y-auto break-all text-xs"
          value={svgInput}
          placeholder={t("Paste SVG code here")}
          onChange={(svg) => handleSvgChange(svg)}
        />
      ) : (
        <textarea
          id={id}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          value={svgInput}
          onChange={(e) => handleSvgChange(e.target.value)}
          placeholder={t("Paste SVG code here")}
          className="no-scrollbar h-[64px] min-w-0 flex-1 resize-none break-all rounded-md border border-input bg-transparent px-2 py-1 text-[11px] leading-4 text-foreground shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
    </div>
  );
};

export { IconPickerField };
