import type { Editor } from "@tiptap/react";
import { isEmpty } from "lodash-es";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageTypeField } from "~/builder/core/rjsf-widgets/link";
import { cn } from "~/builder/core/utils/cn";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { isInternalHref, isPageLinkRef, linkTargetAttrs } from "./use-rte-editor";

/** `page`: a site page picked by search. `custom`: an href typed by hand (URL, email, phone, path). */
type LinkMode = "page" | "custom";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const PHONE = /^\+?[\d\s().-]+$/;
const EMPTY_HOSTS: string[] = [];

/**
 * The href for what an editor typed. A bare email or phone number gets its `mailto:` / `tel:`;
 * anything with a scheme (`https:`, `mailto:`, `tel:`, …), a path or an `#anchor` is kept as typed.
 */
export const toLinkHref = (input: string): string => {
  const value = input.trim();
  if (HAS_SCHEME.test(value)) return value;
  if (EMAIL.test(value)) return `mailto:${value}`;
  if (PHONE.test(value) && value.replace(/\D/g, "").length >= 7) return `tel:${value.replace(/[^\d+]/g, "")}`;
  return value;
};

/**
 * Add or edit the link on the RTE selection: a site page, stored as a `pageType:` ref like the
 * Link block's, or a typed URL, email address or phone number. Either can open in a new tab.
 */
const RteLinkForm = ({ editor, onClose }: { editor: Editor; onClose: () => void }) => {
  const { t } = useTranslation();
  const pageTypes = useBuilderProp("pageTypes", []);
  const internalLinkHosts = useBuilderProp("internalLinkHosts", EMPTY_HOSTS);
  const canLinkPages = !isEmpty(pageTypes);
  const currentLink = editor.getAttributes("link");
  const currentHref: string = currentLink.href ?? "";
  const isPageLink = isPageLinkRef(currentHref);
  const [mode, setMode] = useState<LinkMode>(canLinkPages && (isPageLink || !currentHref) ? "page" : "custom");
  const [customHref, setCustomHref] = useState(isPageLink ? "" : currentHref);
  // An internal link opens in a new tab only when that was chosen here: older editors put `_blank`
  // on every link, and sites render those internal ones in the same tab.
  const [newTab, setNewTab] = useState(
    isInternalHref(currentHref, internalLinkHosts)
      ? currentLink["data-new-tab"] != null
      : currentLink.target === "_blank",
  );
  const newTabId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The settings-panel dropdown focuses its own content once open; take focus after it.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const setLink = (href: string) => {
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href, ...linkTargetAttrs(newTab) })
      .run();
    onClose();
  };

  const onNewTabChange = (checked: boolean) => {
    setNewTab(checked);
    // An existing link changes right away; a new one takes it when it is applied. No focus():
    // the form stays open, and the settings dropdown would take focus straight back.
    if (currentHref) editor.chain().extendMarkRange("link").updateAttributes("link", linkTargetAttrs(checked)).run();
  };

  const applyCustomHref = () => {
    const href = toLinkHref(customHref);
    if (href) setLink(href);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep typing out of the dropdown's typeahead and the canvas editor's own key handling.
    e.stopPropagation();
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && mode === "custom") {
      e.preventDefault();
      applyCustomHref();
    }
  };

  return (
    <div id="chai-rte-link-form" className="text-foreground flex w-72 flex-col gap-y-1.5" onKeyDown={onKeyDown}>
      {canLinkPages && (
        <div className="bg-muted flex gap-x-0.5 rounded-md p-0.5">
          {(["page", "custom"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn("flex-1 rounded px-2 py-0.5 text-xs", mode === value ? "bg-background shadow-sm" : "")}>
              {value === "page" ? t("Page") : t("URL / Email / Phone")}
            </button>
          ))}
        </div>
      )}
      {mode === "page" ? (
        <PageTypeField
          href={isPageLink ? currentHref : ""}
          inputRef={inputRef}
          // An empty href is the field's clear button, not a choice.
          onChange={(href) => href && setLink(href)}
          resultsClassName="static mt-1 max-h-48 max-w-none shadow-none"
        />
      ) : (
        <div className="flex items-center gap-x-1">
          <Input
            ref={inputRef}
            type="text"
            value={customHref}
            onChange={(e) => setCustomHref(e.target.value)}
            placeholder={t("URL, email or phone")}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            className="h-7 text-xs"
          />
          <Button type="button" size="sm" className="h-7" disabled={!customHref.trim()} onClick={applyCustomHref}>
            {t("Apply")}
          </Button>
        </div>
      )}
      <div className="flex min-h-7 items-center justify-between gap-x-2">
        <div className="flex items-center gap-x-1.5">
          <Checkbox id={newTabId} checked={newTab} onCheckedChange={(checked) => onNewTabChange(checked === true)} />
          <Label htmlFor={newTabId} className="!mb-0 pb-0 text-xs font-normal">
            {t("Open in new tab")}
          </Label>
        </div>
        {currentHref && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={removeLink}>
            {t("Remove link")}
          </Button>
        )}
      </div>
    </div>
  );
};

export default RteLinkForm;
