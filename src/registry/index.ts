import { each, get, intersection, isEmpty, keys, mapValues, omit } from "lodash-es";
import { STYLES_KEY } from "~/constants/STRINGS";
import { ChaiBlockPropsSchema, ChaiBlockRJSFSchemas, ChaiBlockUiSchema } from "~/types/common";

export const registerChaiBlockProps = (blockSchema: ChaiBlockPropsSchema): ChaiBlockRJSFSchemas => {
  const reservedProps = ["_type", "_id", "_parent", "_bindings", "_name", "_variant"];
  const runtimeProps = ["$loading", "blockProps", "inBuilder", "lang", "draft", "pageProps", "pageData", "children"];
  const propsKeys = keys(blockSchema.properties);

  if (intersection(propsKeys, reservedProps).length > 0) {
    throw new Error(`Reserved props are not allowed: ${intersection(propsKeys, reservedProps).join(", ")}`);
  }

  if (intersection(propsKeys, runtimeProps).length > 0) {
    throw new Error(`Runtime props are not allowed in schema: ${intersection(propsKeys, runtimeProps).join(", ")}`);
  }

  const schema = get(blockSchema, "properties", {}) as Record<string, ChaiBlockPropsSchema>;
  const uiSchema = {} as Record<string, ChaiBlockUiSchema>;
  each(schema, (prop, key) => {
    if (!isEmpty(prop.ui)) {
      uiSchema[key] = { ...prop.ui };
      delete schema[key].ui;
    }
  });
  return {
    schema: isEmpty(schema) ? {} : { ...omit(blockSchema, ["ui"]) },
    uiSchema: { ...get(blockSchema, "ui", {}), ...uiSchema },
  };
};

/**
 * Helper to get schema from block config.
 * @internal
 */
export const getBlockSchema = (config: { props?: { schema?: any } }) => {
  return config.props?.schema;
};

/**
 * Helper to get uiSchema from block config.
 * @internal
 */
export const getBlockUiSchema = (config: { props?: { uiSchema?: any } }) => {
  return config.props?.uiSchema;
};

export const stylesProp = (defaultClasses: string = ""): ChaiBlockPropsSchema => {
  return {
    type: "string",
    styles: true,
    default: `${STYLES_KEY},${defaultClasses}`,
    ui: { "ui:widget": "hidden" },
  };
};

// A named slot: filled by the child `ChaiSlot` block whose `_slot` is this prop's key.
export const chaiSlot = ({ title, accept }: { title?: string; accept?: RegExp } = {}): ChaiBlockPropsSchema => ({
  type: "string",
  slot: true,
  ...(title ? { title } : {}),
  // Plain strings, and no undefined keys: RJSF's allOf merge throws on either.
  ...(accept ? { acceptSource: accept.source, acceptFlags: accept.flags } : {}),
  ui: { "ui:widget": "hidden" },
});

/**
 * Groups flat props under one collapsible section in the settings panel. Props stay
 * top-level in the schema and in block data — only the `group` marker is added.
 * Spread the result into `properties`. Groups nest one level deep: spread a
 * `groupProps` into another's `properties` and it becomes a subgroup of that group.
 */
export const groupProps = ({
  label,
  properties,
  defaultOpen = true,
}: {
  label: string;
  properties: Record<string, ChaiBlockPropsSchema>;
  /** Whether the group starts expanded in the settings panel. */
  defaultOpen?: boolean;
}): Record<string, ChaiBlockPropsSchema> =>
  mapValues(properties, (prop, key) => {
    if (prop?.subgroup) {
      throw new Error(
        `Groups nest at most two levels: "${key}" is already in group "${prop.group}" > "${prop.subgroup}"`,
      );
    }
    // Only a closed default is recorded, so groups without one keep their exact schema.
    const own = defaultOpen ? { group: label } : { group: label, groupDefaultOpen: false };
    if (!prop?.group) return { ...prop, ...own };
    // The inner group moves down to a subgroup, taking its default with it.
    const { groupDefaultOpen, ...inner } = prop;
    return {
      ...inner,
      ...own,
      subgroup: prop.group,
      ...(groupDefaultOpen === false ? { subgroupDefaultOpen: false } : {}),
    };
  });

export const builderProp =(options: ChaiBlockPropsSchema): ChaiBlockPropsSchema => {
  return {
    builderProp: true,
    ...options,
  };
};

export const defaultChaiStyles = (classes: string) => `${STYLES_KEY},${classes}`;

export * from "./v2/runtime";
export { getRegisteredChaiPipes, registerChaiPipe } from "./pipes";
