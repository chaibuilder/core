import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { startsWith } from "lodash-es";
import React from "react";
import { ChaiBindingNode, tokenizeBindings } from "~/builder/core/rjsf-widgets/binding-editor/binding-node";
import { createBindingSuggestionExtension } from "~/builder/core/rjsf-widgets/binding-editor/binding-suggestion";
import type { BindingSuggestionItem } from "~/builder/core/rjsf-widgets/binding-editor/use-binding-suggestion-items";

/**
 * A link to a site page is stored as a `pageType:<pageTypeKey>:<primaryPageId>` ref, the Link
 * block's format, and resolved to the page's current URL at render time.
 */
export const isPageLinkRef = (href: unknown): href is string =>
  typeof href === "string" && startsWith(href, "pageType:");

/** An in-site href: a page ref, a path, an `#anchor` or an absolute URL on a known site host. */
export const isInternalHref = (href: string, siteHosts: readonly string[] = []) =>
  isPageLinkRef(href) ||
  /^(\/|#|\.\/|\.\.\/)/.test(href) ||
  (URL.canParse(href) && siteHosts.includes(new URL(href).host));

/**
 * `target`/`rel` for a link that opens in a new tab or the same one, as the Link block renders them.
 * `data-new-tab` marks the new tab as chosen: older editors put `_blank` on every link, so a renderer
 * that drops it from internal links (which older content needs) can still honour this one.
 */
export const linkTargetAttrs = (newTab: boolean) =>
  newTab
    ? { target: "_blank", rel: "noopener noreferrer", "data-new-tab": "true" }
    : { target: null, rel: null, "data-new-tab": null };

export const RteLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), "data-new-tab": { default: null } };
  },
}).configure({
  openOnClick: false,
  // tiptap drops links whose scheme it doesn't know, so a page ref would be lost on load
  // and saved with an empty href.
  isAllowedUri: (url, ctx) => isPageLinkRef(url) || ctx.defaultValidate(url),
  HTMLAttributes: {
    class: "underline",
    // tiptap defaults every link to `target="_blank" rel="noopener noreferrer nofollow"`, even
    // one loaded without them. Keep what the HTML says; the link form sets them per link.
    target: null,
    rel: null,
  },
});

/**
 *
 * @param blockId
 * @param value
 * @param onUpdate
 * @param onBlur
 * @param placeholder
 * @param from
 * @param style
 * @param getBindingItems - when provided (settings panel), enables `{{` badges + dropdown
 * @returns RTE Editor
 */
export const useRTEditor = ({
  blockId,
  value = "",
  onUpdate = () => {},
  onBlur = () => {},
  placeholder = "",
  from = "settings",
  style = {},
  getBindingItems,
}: {
  blockId: string;
  value: string;
  onUpdate?: (arg: { editor: Editor; event: Event }) => void;
  onBlur: (arg: { editor: Editor; event: FocusEvent }) => void;
  placeholder?: string;
  from?: "settings" | "canvas";
  style?: React.CSSProperties;
  getBindingItems?: (query: string) => BindingSuggestionItem[];
}) => {
  const getItemsRef = React.useRef(getBindingItems);
  getItemsRef.current = getBindingItems;

  const bindingEnabled = from !== "canvas" && !!getBindingItems;

  return useEditor(
    {
      extensions: [
        StarterKit,
        TextStyle,
        Color.configure({
          types: ["textStyle"],
        }),
        Highlight.configure({
          multicolor: true,
        }),
        RteLink,
        TextAlign.configure({
          types: ["heading", "paragraph"],
          alignments: ["left", "center", "right"],
          defaultAlignment: "left",
        }),
        Underline,
        Placeholder.configure({
          placeholder: placeholder || "Enter text here",
          emptyEditorClass:
            "cursor-text before:content-[attr(data-placeholder)] before:absolute before:opacity-50 before:pointer-events-none",
        }),
        ...(bindingEnabled
          ? [ChaiBindingNode, createBindingSuggestionExtension((query) => getItemsRef.current?.(query) ?? [])]
          : []),
      ],
      content: value || "",
      onCreate: ({ editor }) => {
        if (bindingEnabled) tokenizeBindings(editor as Editor);
      },
      onUpdate: onUpdate as any,
      onBlur: onBlur as any,
      editorProps: {
        attributes: {
          ...((style ? { style } : {}) as any),
          class: from !== "canvas" ? "text-sm p-1 px-2 rte" : "rte",
        },
      },
    },
    // Re-create the editor when binding turns on (page data can arrive after mount) so the
    // binding node/suggestion extensions and initial tokenization are applied.
    [blockId, bindingEnabled],
  );
};
