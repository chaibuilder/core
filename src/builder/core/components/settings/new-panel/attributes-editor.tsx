"use client";

import { Cross1Icon, Pencil2Icon } from "@radix-ui/react-icons";
import { isEmpty } from "lodash-es";
import { Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageExternalData } from "~/builder/atoms/builder";
import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Textarea } from "~/components/ui/textarea";
import PanelItemWithAccordion from "./panel-item-with-accordion";

type Attribute = {
  key: string;
  value: string;
};

interface AttributeManagerProps {
  preloadedAttributes?: Attribute[];
  onAttributesChange?: (attributes: Attribute[]) => void;
}

export default React.memo(function AttrsEditor({
  preloadedAttributes = [],
  onAttributesChange,
}: AttributeManagerProps) {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const pageExternalData = usePageExternalData();
  const { t } = useTranslation();

  useEffect(() => {
    setAttributes(preloadedAttributes);
  }, [preloadedAttributes]);

  const addAttribute = () => {
    if (newKey.startsWith("@")) {
      setError(t("Attribute keys cannot start with @"));
      return;
    }
    if (newKey) {
      const newAttributes = [...attributes, { key: newKey, value: newValue }];
      onAttributesChange?.(newAttributes);
      setAttributes(newAttributes);
      setNewKey("");
      setNewValue("");
      setError("");
      setPopoverOpen(false);
    }
  };

  const removeAttribute = (index: number) => {
    const newAttributes = attributes.filter((_, i) => i !== index);
    onAttributesChange?.(newAttributes);
    setAttributes(newAttributes);
  };

  const startEdit = (index: number) => {
    setEditIndex(index);
    setNewKey(attributes[index].key);
    setNewValue(attributes[index].value);
    setPopoverOpen(true);
  };

  const saveEdit = () => {
    if (newKey.startsWith("@")) {
      setError(t("Attribute keys cannot start with @"));
      return;
    }
    if (editIndex !== null && newKey) {
      const newAttributes = [...attributes];
      newAttributes[editIndex] = { key: newKey, value: newValue };
      onAttributesChange?.(newAttributes);
      setAttributes(newAttributes);
      setEditIndex(null);
      setNewKey("");
      setNewValue("");
      setError("");
      setPopoverOpen(false);
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editIndex !== null) {
        saveEdit();
      } else {
        addAttribute();
      }
    }
  };

  const handlePathSelect = useCallback((path: string) => {
    // Helper function to check if character is punctuation
    const isPunctuation = (char: string) => /[.,!?;:]/.test(char);

    // Helper function to add smart spacing around a placeholder
    const addSmartSpacing = (text: string, position: number, placeholder: string) => {
      // Determine if we need spacing
      let prefix = "";
      let suffix = "";

      // Get characters before and after cursor
      const charBefore = position > 0 ? text[position - 1] : "";
      const charAfter = position < text.length ? text[position] : "";

      // Handle spacing before placeholder
      if (position > 0) {
        // Always add space after a period/full stop
        if (charBefore === ".") {
          prefix = " ";
        }
        // For other cases, add space if not punctuation and not already a space
        else if (!isPunctuation(charBefore) && charBefore !== " ") {
          prefix = " ";
        }
      }

      // Handle spacing after placeholder
      if (position < text.length && !isPunctuation(charAfter) && charAfter !== " ") {
        suffix = " ";
      }

      return {
        text: prefix + placeholder + suffix,
        prefixLength: prefix.length,
        suffixLength: suffix.length,
      };
    };

    // Handle regular textarea field
    const textarea = valueTextareaRef.current;
    if (textarea) {
      const cursorPos = textarea.selectionStart || 0;
      const currentValue = textarea.value || "";

      // Check if there's any text selection
      const selectionEnd = textarea.selectionEnd || cursorPos;
      const hasSelection = selectionEnd > cursorPos;

      // If text is selected, replace it with the shortcode
      if (hasSelection) {
        const basePlaceholder = `{{${path}}}`;
        const { text: placeholderWithSpacing } = addSmartSpacing(currentValue, cursorPos, basePlaceholder);

        const newValue = currentValue.slice(0, cursorPos) + placeholderWithSpacing + currentValue.slice(selectionEnd);

        // Update the value
        setNewValue(newValue);
        return;
      }

      // No selection, just insert at cursor position with smart spacing
      const basePlaceholder = `{{${path}}}`;
      const { text: placeholderWithSpacing } = addSmartSpacing(currentValue, cursorPos, basePlaceholder);

      // Create the new value with smart spacing
      const newValue = currentValue.slice(0, cursorPos) + placeholderWithSpacing + currentValue.slice(cursorPos);

      // Update the value
      setNewValue(newValue);
    }
  }, []);

  const handleCancel = () => {
    setNewKey("");
    setNewValue("");
    setError("");
    setEditIndex(null);
    setPopoverOpen(false);
  };

  return (
    <PanelItemWithAccordion
      value="attribute-manager"
      defaultOpen={false}
      leftLabel={t("Attributes")}
      rightLabel={(isOpen) => {
        return (
          <Button
            variant="link"
            size="xs"
            onClick={(e) => {
              if (isOpen) {
                e.stopPropagation();
                setPopoverOpen(true);
              }
            }}>
            {isOpen ? (
              <>
                <Plus className="!h-2.5 !w-2.5" /> {t("Add Attribute")}
              </>
            ) : (
              t("View Attribute")
            )}
          </Button>
        );
      }}>
      <div className="relative flex max-h-full flex-1 flex-col">
        <div className="flex items-center p-0">
          <Popover open={popoverOpen} onOpenChange={(_value) => (_value ? setPopoverOpen(true) : handleCancel())}>
            <PopoverTrigger asChild>
              <div />
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3" side="left" align="start">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editIndex !== null) {
                    saveEdit();
                  } else {
                    addAttribute();
                  }
                }}
                className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">
                    {editIndex !== null ? t("Edit attribute") : t("Add attribute")}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button type="submit" disabled={!newKey.length} variant="default" size="xs" className="px-2">
                      {editIndex !== null ? t("Save") : t("Add")}
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={handleCancel} className="font-light">
                      <X />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="space-y-px">
                    <Label htmlFor="attrKey">{t("Key")}</Label>
                    <Input
                      autoCapitalize={"off"}
                      autoCorrect={"off"}
                      spellCheck={"false"}
                      id="attrKey"
                      ref={keyInputRef}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder={t("Enter key")}
                      className="h-7 text-xs"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-px">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="attrValue">{t("Value")}</Label>
                      {!isEmpty(pageExternalData) && (
                        <ChaiNestedPathSelector data={pageExternalData} onSelect={handlePathSelect} />
                      )}
                    </div>
                    <Textarea
                      autoCapitalize={"off"}
                      autoCorrect={"off"}
                      spellCheck={"false"}
                      id="attrValue"
                      ref={valueTextareaRef}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t("Enter value")}
                      rows={2}
                      className="resize-none text-xs"
                    />
                  </div>
                </div>

                {error && <p className="text-destructive text-[10px]">{error}</p>}
              </form>
            </PopoverContent>
          </Popover>
        </div>

        {attributes.length > 0 ? (
          <div className="max-h-[40vh] space-y-1 overflow-y-auto pb-2">
            {attributes.map((attr, index) => (
              <div
                key={index}
                className="border-border bg-muted/10 flex items-center justify-between rounded-md border px-2 py-1 text-sm">
                <div className="flex flex-col gap-0.5 text-xs leading-tight">
                  <span className="text-muted-foreground truncate text-[10px] leading-none font-medium">
                    {attr.key}
                  </span>
                  <span className="text-foreground max-w-[200px] text-xs leading-none font-normal text-wrap">
                    {attr.value.toString()}
                  </span>
                </div>
                <div className="flex flex-shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon-xs" onClick={() => startEdit(index)} className="hover:bg-surface">
                    <Pencil2Icon className="!h-3 !w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="hover:bg-destructive/30 hover:text-foreground"
                    onClick={() => removeAttribute(index)}>
                    <Cross1Icon className="!h-3 !w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Label>{t("No attributes added yet")}</Label>
        )}
      </div>
    </PanelItemWithAccordion>
  );
});
