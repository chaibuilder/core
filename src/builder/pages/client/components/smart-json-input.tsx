import { AlertTriangle, Code, Eye, FileCode2 } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import {
  BindingTextField,
  useBindingInputEnabled,
} from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import {
  evaluatePlaceholders,
  JsonError,
  parseJSONWithPlaceholders,
  restorePlaceholders,
} from "~/builder/pages/utils/json-utils";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";

// tiptap has no `rows`, so the requested row count becomes the same height the textarea
// would have had: `text-xs leading-normal` line box + the editor's `py-2` padding.
const ROW_HEIGHT = 18;
const VERTICAL_PADDING = 16;
const rowsToMinHeight = (rows: number) => rows * ROW_HEIGHT + VERTICAL_PADDING;

interface SmartJsonInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  rows?: number;
  id?: string;
  pageData?: Record<string, any>;
  handleFieldInsert?: (field: string, inputId: string) => void;
  hasJsonLdForSelectedLang?: boolean;
  copyJsonLDFromDefaultPage?: () => void;
  topRightComponent?: React.ReactNode;
}

export const SmartJsonInput: React.FC<SmartJsonInputProps> = ({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = "Enter JSON",
  rows = 6,
  id = "json-input",
  pageData = {},
  handleFieldInsert,
  hasJsonLdForSelectedLang,
  copyJsonLDFromDefaultPage,
  topRightComponent = null,
}) => {
  const [activeTab, setActiveTab] = useState("edit");
  const [jsonError, setJsonError] = useState<JsonError | null>(null);
  const [previewJson, setPreviewJson] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // With page data present, the editor is the tiptap binding field: `{{...}}` render as
  // badges (click = formatter popup) and typing `{{` opens the suggestion dropdown —
  // same experience as every other binding-capable field.
  const bindingMode = useBindingInputEnabled(pageData);
  const showOptionToCopyJsonLd = id === "jsonLD" && !hasJsonLdForSelectedLang && !!copyJsonLDFromDefaultPage;
  // The field picker inserts `{{path}}` at the cursor (a badge in binding mode, raw text in
  // the textarea) — `parseJSONWithPlaceholders` tolerates those and the Preview tab
  // evaluates them.
  const showFieldInsert =
    !!handleFieldInsert &&
    !disabled &&
    !readOnly &&
    !showOptionToCopyJsonLd &&
    activeTab === "edit" &&
    Object.keys(pageData).length > 0;

  useEffect(() => {
    if (value.trim() === "") {
      onChange("{}");
    }
  }, [value, onChange]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault(); // Prevent focus from moving to next element

      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // If there's a selection, indent or unindent multiple lines
      if (start !== end) {
        const selectedText = value.substring(start, end);
        const linesArray = selectedText.split("\n");

        if (e.shiftKey) {
          // Unindent (remove 2 spaces from start of each line if present)
          const unindentedLines = linesArray.map((line) => {
            if (line.startsWith("  ")) return line.substring(2);
            return line;
          });
          const newText = unindentedLines.join("\n");
          const newValue = value.substring(0, start) + newText + value.substring(end);
          onChange(newValue);

          // Maintain selection
          setTimeout(() => {
            textarea.selectionStart = start;
            textarea.selectionEnd = start + newText.length;
          }, 0);
        } else {
          // Indent (add 2 spaces to start of each line)
          const indentedLines = linesArray.map((line) => `  ${line}`);
          const newText = indentedLines.join("\n");
          const newValue = value.substring(0, start) + newText + value.substring(end);
          onChange(newValue);

          // Maintain selection
          setTimeout(() => {
            textarea.selectionStart = start;
            textarea.selectionEnd = start + newText.length;
          }, 0);
        }
      } else {
        // No selection - insert 2 spaces at cursor position
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);

        // Move cursor after inserted spaces
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    }
  };

  useEffect(() => {
    // Analyze the JSON when the value changes
    const result = parseJSONWithPlaceholders(value);

    if (result.isValid) {
      startTransition(() => {
        setJsonError(null);

        if (result.parsed) {
          // For preview with evaluated placeholders
          const evaluated = evaluatePlaceholders(result.parsed, pageData);
          setPreviewJson(evaluated);
        } else {
          setPreviewJson("");
        }
      });
    } else {
      startTransition(() => {
        setJsonError(result.error);
        setPreviewJson("");
      });
    }
  }, [value, pageData]);

  const handleFormat = () => {
    const result = parseJSONWithPlaceholders(value);
    if (result.isValid && result.parsed) {
      const formatted = restorePlaceholders(result.parsed, result.placeholders);
      onChange(formatted);
    }
  };

  const highlightError = () => {
    if (jsonError?.position && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(jsonError.position, jsonError.position + 1);
    }
  };

  return (
    <ErrorBoundary fallback={<div>Some error</div>}>
      <div className="space-y-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-2 flex items-center justify-between">
            <TabsList className="w-max">
              <TabsTrigger value="edit" className="px-3">
                <Code className="h-4 w-4" />
                <span>Edit</span>
              </TabsTrigger>
              <TabsTrigger value="preview" className="px-3" disabled={!value.trim() || jsonError !== null}>
                <Eye className="h-4 w-4" />
                <span>Preview</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1">
              {topRightComponent}
              {showFieldInsert && (
                <ChaiNestedPathSelector
                  dataType="value"
                  data={pageData}
                  onSelect={(field) => handleFieldInsert(field, id)}
                />
              )}
            </div>
          </div>

          <TabsContent value="edit" className="relative mt-0">
            {!showOptionToCopyJsonLd && activeTab === "edit" && (
              <Tooltip content="Format JSON" side="right" showTooltip={!disabled && !jsonError}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleFormat}
                  // `z-10`: the binding editor's container is `relative` and comes later in
                  // the DOM, so without an explicit stacking order it paints over this button
                  // and swallows the click — Format looked dead in binding mode.
                  className="absolute top-1 right-1 z-10 h-6 w-6 p-1"
                  disabled={!value.trim() || disabled || jsonError !== null}>
                  <FileCode2 />
                </Button>
              </Tooltip>
            )}
            {showOptionToCopyJsonLd ? (
              <div className="bg-muted/10 flex h-40 items-center justify-center rounded-md">
                <div className="rounded-m flex max-w-[400px] flex-col items-center gap-3 p-4">
                  <div className="text-muted max-w-xl text-center text-xs">
                    JSON-LD for is not added for selected language. JSON LD will be used from default language.
                  </div>
                  <Button type="button" variant="default" size="sm" onClick={copyJsonLDFromDefaultPage}>
                    Copy & Edit from default language
                  </Button>
                </div>
              </div>
            ) : bindingMode ? (
              <BindingTextField
                id={id}
                value={value}
                multiline
                minHeight={rowsToMinHeight(rows)}
                indentWithTab
                placeholder={placeholder}
                externalData={pageData}
                editable={!disabled && !readOnly}
                onChange={onChange}
                className={`font-mono [&_p]:whitespace-pre-wrap ${jsonError ? "border-destructive" : ""}`}
              />
            ) : (
              <Textarea
                ref={textareaRef}
                id={id}
                name={id}
                className={`${jsonError ? "border-destructive" : ""}`}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                value={value}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                readOnly={readOnly}
              />
            )}

            {jsonError && (
              <div className="bg-destructive/10 text-destructive mt-2 flex items-center gap-2 rounded-md p-2 text-xs">
                <AlertTriangle className="h-4 w-4" />
                <div className="flex items-center gap-2 text-sm">
                  <span>{`${jsonError.message}`}</span>
                  {!bindingMode && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={highlightError}>
                      Show
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <Textarea
              rows={rows}
              value={previewJson}
              readOnly
              className="bg-muted/10 text-foreground/70 cursor-default font-mono font-light"
            />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};
