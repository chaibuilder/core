import { ButtonIcon } from "@radix-ui/react-icons";
import { get, isEmpty } from "lodash-es";
import { createElement } from "react";
import { groupProps, registerChaiBlockProps, stylesProp } from "~/registry";
import { useInnerHtml } from "~/web-blocks/use-inner-html";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";
import { getAriaLabel } from "~/web-blocks/helper";

export type ButtonProps = {
  content: string;
  icon: string;
  iconSize: number;
  iconPos: "order-first" | "order-last";
  styles: ChaiStyles;
  link: {
    href: string;
    target: string;
  };
};

const Component = (props: ChaiBlockComponentProps<ButtonProps>) => {
  const { blockProps, iconSize, icon, content, styles, children, iconPos, link, inBuilder } = props;
  const _icon = icon;
  const iconHtml = useInnerHtml(_icon);

  // `content` drives both the visible label and the accessible name, so
  // normalize it once. A whitespace-only label renders nothing a user can see
  // and must not count as a name either.
  const label = typeof content === "string" ? content.trim() : "";

  // Never emit an empty `aria-label`: it blanks the accessible name of an
  // icon-only button and fails the "Buttons must have discernible text" audit.
  // `styles` is spread after `blockProps` below, so an author-set attribute on
  // `styles` wins - matching render-time precedence. When nested children
  // supply the visible text, `content` is usually a stale schema default, so
  // it must not fall back into the accessible name either.
  const ariaLabel = getAriaLabel(styles) || getAriaLabel(blockProps) || (children ? undefined : label || undefined);

  const child = children || (
    <>
      {label && <span>{label}</span>}
      {_icon && (
        <div
          // Only decorative once the button has a name of its own. When the
          // icon is the sole content, hiding it would leave no accessible name
          // at all, so let its markup (e.g. an <svg><title>) through instead.
          aria-hidden={ariaLabel ? "true" : undefined}
          style={{ width: iconSize + "px" }}
          className={iconPos + " " + (label ? (iconPos === "order-first" ? "mr-2" : "ml-2") : "") || ""}
          dangerouslySetInnerHTML={iconHtml}
        />
      )}
    </>
  );

  const button = createElement(
    "button",
    {
      ...blockProps,
      ...styles,
      type: "button",
      "aria-label": ariaLabel,
    },
    child,
  );

  if (!isEmpty(get(link, "href"))) {
    if (inBuilder) {
      return <span>{button}</span>;
    } else {
      // A single <a> carries the button's blockProps/styles: nesting a
      // <button> inside the link is invalid HTML (interactive within
      // interactive) and splits keyboard/AT behavior across two elements.
      return createElement(
        "a",
        {
          ...blockProps,
          ...styles,
          href: get(link, "href") || "/",
          target: get(link, "target", "_self"),
          "aria-label": ariaLabel,
        },
        child,
      );
    }
  }

  return button;
};

const Config = {
  type: "Button",
  description: "similar to a button element in HTML",
  label: "Button",
  category: "core",
  icon: ButtonIcon,
  group: "basic",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("dt#btn dt#btn-primary"),
      content: {
        type: "string",
        title: "Button label",
        default: "Button",
      },
      ...groupProps({
        label: "Link",
        properties: {
          link: {
            type: "object",
            properties: {
              type: { type: "string" },
              href: { type: "string" },
              target: { type: "string" },
            },
            default: {
              type: "url",
              href: "",
              target: "_self",
            },
            ui: { "ui:field": "link" },
          },
          prefetchLink: {
            type: "boolean",
            default: true,
            title: "Prefetch Link",
          },
        },
      }),
      ...groupProps({
        label: "Icon",
        properties: {
          icon: {
            type: "string",
            title: "Icon",
            default: "",
            ui: { "ui:widget": "icon" },
          },
          iconSize: {
            type: "number",
            title: "Icon size",
            default: 16,
          },
          iconPos: {
            type: "string",
            title: "Icon position",
            default: "order-last",
            enum: ["order-first", "order-last"],
            enumNames: ["Left", "Right"],
          },
        },
      }),
    },
  }),
  i18nProps: ["content", "link"],
  aiProps: ["content"],
  childrenOverrideProps: ["content", "icon", "iconSize", "iconPos"],
};
export { Component, Config };
