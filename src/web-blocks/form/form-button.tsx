import { ButtonIcon } from "@radix-ui/react-icons";
import { registerChaiBlockProps, stylesProp } from "~/registry";
import { useInnerHtml } from "~/web-blocks/use-inner-html";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";
import { getAriaLabel } from "~/web-blocks/helper";

export type FormButtonProps = {
  label: string;
  styles: ChaiStyles;
  icon: string;
  iconSize: number;
  iconPos: "order-first" | "order-last";
};

const DEFAULT_ARIA_LABEL = "Submit";

const FormButtonBlock = (props: ChaiBlockComponentProps<FormButtonProps>) => {
  const { blockProps, inBuilder, label, styles, icon, iconSize, iconPos } = props;
  const iconHtml = useInnerHtml(icon);

  // An icon-only button has no text node, so its accessible name has to come
  // from aria-label. Emitting an empty one blanks the name entirely and fails
  // the "Buttons must have discernible text" audit, so resolve it in order:
  // author-set attribute > visible label > generic fallback.
  //
  // `blockProps` is spread after `styles` below, so it wins here too. Note the
  // Button block spreads them the other way round and resolves accordingly.
  const authoredAriaLabel = getAriaLabel(blockProps) || getAriaLabel(styles);
  const visibleLabel = typeof label === "string" ? label.trim() : "";
  const ariaLabel = authoredAriaLabel || visibleLabel || DEFAULT_ARIA_LABEL;

  return (
    <button {...styles} {...(blockProps || {})} type={inBuilder ? "button" : "submit"} aria-label={ariaLabel}>
      {visibleLabel}
      {icon && (
        <div
          aria-hidden="true"
          style={{ width: iconSize + "px" }}
          className={iconPos + " " + (visibleLabel ? (iconPos === "order-first" ? "mr-2" : "ml-2") : "") || ""}
          dangerouslySetInnerHTML={iconHtml}
        />
      )}
    </button>
  );
};

const Config = {
  type: "FormButton",
  label: "Submit Button",
  category: "core",
  icon: ButtonIcon,
  group: "form",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("dt#btn dt#btn-primary"),
      label: {
        type: "string",
        title: "Label",
        default: "Submit",
        ai: true,
        i18n: true,
      },
      icon: {
        type: "string",
        title: "Icon",
        default: "",
        ui: { "ui:widget": "icon" },
      },
      iconSize: {
        type: "number",
        title: "Icon size",
        default: 24,
      },
      iconPos: {
        type: "string",
        title: "Icon Position",
        default: "order-last",
        enum: ["order-first", "order-last"],
      },
    },
  }),
  i18nProps: ["label"],
  aiProps: ["label"],
};

export { FormButtonBlock as Component, Config };
