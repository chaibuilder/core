import { DropdownMenuIcon } from "@radix-ui/react-icons";
import { map } from "lodash-es";
import { registerChaiBlockProps, stylesProp } from "~/registry";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";

export type SelectProps = {
  showLabel: boolean;
  styles: ChaiStyles;
  inputStyles: ChaiStyles;
  required: boolean;
  _multiple: boolean;
  options: { label: string; value: string }[];
  label: string;
  placeholder: string;
  fieldName: string;
  defaultValue: string;
};

const SelectBlock = (props: ChaiBlockComponentProps<SelectProps>) => {
  const {
    blockProps,
    fieldName,
    label,
    placeholder,
    styles,
    inputStyles,
    required,
    showLabel,
    _multiple,
    options,
    defaultValue,
  } = props;

  // Process defaultValue for multi-select
  const processedDefaultValues =
    _multiple && defaultValue ? defaultValue.split(",").map((val) => val.trim()) : defaultValue || "";

  if (!showLabel) {
    return (
      <select
        {...styles}
        {...blockProps}
        required={required}
        multiple={_multiple}
        name={fieldName}
        defaultValue={processedDefaultValues}>
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {map(options, (option, index) => (
          <option key={`${option?.value ?? ""}-${index}`} value={option?.value}>
            {option?.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div {...styles} {...blockProps}>
      {showLabel && <label htmlFor={fieldName}>{label}</label>}
      <select
        {...inputStyles}
        required={required}
        multiple={_multiple}
        name={fieldName}
        defaultValue={processedDefaultValues}>
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {map(options, (option, index) => (
          <option key={`${option?.value ?? ""}-${index}`} value={option?.value}>
            {option?.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const Config = {
  type: "Select",
  label: "web_blocks.select",
  category: "core",
  icon: DropdownMenuIcon,
  group: "form",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
      inputStyles: stylesProp("w-full p-1"),
      fieldName: {
        type: "string",
        title: "Field Name",
        default: "fieldName",
      },
      showLabel: {
        type: "boolean",
        title: "Show Label",
        default: true,
      },
      label: {
        type: "string",
        title: "Label",
        default: "Label",
      },
      placeholder: {
        type: "string",
        title: "Placeholder",
        default: "Placeholder",
      },
      required: {
        type: "boolean",
        title: "Required",
        default: false,
      },
      defaultValue: {
        type: "string",
        title: "Default Value",
        default: "",
      },
      _multiple: {
        type: "boolean",
        title: "Multiple",
        default: false,
      },
      options: {
        title: "Options",
        type: "array",
        default: [],
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              title: "Label",
              default: "",
            },
            value: {
              type: "string",
              title: "Value",
              default: "",
            },
          },
        },
      },
    },
  }),
  i18nProps: ["label", "placeholder", "options"],
};

export { SelectBlock as Component, Config };
