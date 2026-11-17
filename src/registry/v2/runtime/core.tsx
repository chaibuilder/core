import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import {
  cloneDeep,
  each,
  get,
  has,
  isArray,
  isEmpty,
  isString,
  keys,
  memoize,
  omitBy,
  set,
  startCase,
} from "lodash-es";
import React, { useMemo } from "react";
import { STYLES_KEY } from "~/constants/STRINGS";
import type { ChaiBlockConfig, ChaiBlockVariant } from "~/types/blocks";
import { ChaiBlockComponentProps } from "~/types/blocks";
import { ChaiBlock, ChaiBlockPropsSchema, ChaiPageProps } from "~/types/common";

const REGISTERED_CHAI_BLOCKS: Record<
  string,
  ChaiBlockConfig & { component: React.ComponentType<ChaiBlockComponentProps> }
> = {};

export const useRegisteredChaiBlocks = () => {
  return REGISTERED_CHAI_BLOCKS;
};

/** Returns all registered ChaiBlock configs. Safe to call outside React. */
export const getRegisteredChaiBlocks = (): Record<
  string,
  ChaiBlockConfig & { component: React.ComponentType<ChaiBlockComponentProps> }
> => {
  return REGISTERED_CHAI_BLOCKS;
};

export const useRegisteredChaiBlock = (type: keyof typeof REGISTERED_CHAI_BLOCKS) => {
  return useMemo(() => get(REGISTERED_CHAI_BLOCKS, type, null), [type]);
};

export const getRegisteredChaiBlock = (
  type: keyof typeof REGISTERED_CHAI_BLOCKS,
):
  | (ChaiBlockConfig & {
      component: React.ComponentType<ChaiBlockComponentProps>;
    })
  | undefined => {
  return get(REGISTERED_CHAI_BLOCKS, type) as ChaiBlockConfig & {
    component: React.ComponentType<ChaiBlockComponentProps>;
  };
};

type RegisteredBlock = ChaiBlockConfig & { component: React.ComponentType<ChaiBlockComponentProps> };

const getBlockVariant = (
  registeredBlock: RegisteredBlock | null | undefined,
  variant?: string,
): ChaiBlockVariant | undefined =>
  registeredBlock && variant ? get(registeredBlock, ["variants", variant]) : undefined;

/**
 * Resolves the component to render for a block instance. A block may register
 * named `variants` alongside its default component; `block._variant` picks one.
 * An absent, empty or unknown variant name, or a variant without a `component`,
 * falls back to the default, so a renamed or removed variant never breaks a saved page.
 */
export const resolveChaiBlockComponent = (
  registeredBlock: RegisteredBlock | null | undefined,
  variant?: string,
): React.ComponentType<ChaiBlockComponentProps> | null => {
  if (!registeredBlock) return null;
  const variantComponent = getBlockVariant(registeredBlock, variant)?.component;
  return (variantComponent as React.ComponentType<ChaiBlockComponentProps>) ?? get(registeredBlock, "component", null);
};

const toChaiStylesValue = (classes: string) =>
  // An author may pass a full "#styles:base,classes" string to control both
  // segments; a bare class list becomes the user-facing (winning) segment.
  classes.startsWith(STYLES_KEY) ? classes : `${STYLES_KEY},${classes}`;

const isStylesProp = (registeredBlock: RegisteredBlock, prop: string) =>
  get(registeredBlock, ["props", "schema", "properties", prop, "styles"]) === true;

// Default of a prop declared only inside an `allOf` if/then branch, which getBlockDefaultProps skips.
const getConditionalDefault = (registeredBlock: RegisteredBlock, prop: string) => {
  const rules = get(registeredBlock, ["props", "schema", "allOf"], []) as unknown[];
  const path = ["then", "properties", prop, "default"];
  const rule = rules.find((candidate) => has(candidate, path));
  return rule ? get(rule, path) : undefined;
};

/**
 * Props written into the block when `variant` is selected in the builder.
 * Variants are applied at edit time, not at render time — the values land in the
 * block's own props, so the saved page needs no variant lookup and the style
 * panel keeps working on the result.
 *
 * The keys returned are the union of every prop any variant of this block
 * controls, so switching between variants (or back to Default) always resets
 * props the newly selected variant does not set back to their schema default
 * (including defaults declared in `allOf` branches), instead of leaving the
 * previous variant's values behind.
 *
 * Returns undefined when no variant of the block sets any props.
 */
export const getChaiBlockVariantProps = (
  registeredBlock: RegisteredBlock | null | undefined,
  variant?: string,
): Record<string, unknown> | undefined => {
  const variants = get(registeredBlock, "variants", {}) as Record<string, ChaiBlockVariant>;
  const controlledProps = new Set<string>();
  each(variants, (value) => each(keys(value?.props), (prop) => controlledProps.add(prop)));
  if (controlledProps.size === 0) return undefined;

  const selectedProps = getBlockVariant(registeredBlock, variant)?.props ?? {};
  const defaults = getChaiBlockDefaultProps(registeredBlock!.type);

  const variantProps: Record<string, unknown> = {};
  controlledProps.forEach((prop) => {
    const isStyles = isStylesProp(registeredBlock!, prop);
    if (has(selectedProps, prop)) {
      const value = selectedProps[prop];
      variantProps[prop] = isStyles && isString(value) ? toChaiStylesValue(value) : value;
    } else {
      const defaultValue = has(defaults, prop) ? get(defaults, prop) : getConditionalDefault(registeredBlock!, prop);
      variantProps[prop] = defaultValue === undefined && isStyles ? `${STYLES_KEY},` : defaultValue;
    }
  });
  return variantProps;
};

// REGISTERED_CHAI_BLOCKS is mutated after module load (late registration,
// re-registration, HMR), so plain memoize(type) can cache stale results.
// This skips caching while the type is unregistered, and registry mutations
// call invalidateBlockMemoCaches(type) to evict entries for updated types.
/** @internal */
export type MemoizedByRegisteredType<T> = ((type: keyof typeof REGISTERED_CHAI_BLOCKS) => T) & {
  cache: { delete: (key: string) => boolean };
};

/** @internal */
export const memoizeByRegisteredType = <T,>(
  getter: (type: keyof typeof REGISTERED_CHAI_BLOCKS) => T,
): MemoizedByRegisteredType<T> => {
  const memoized = memoize(getter);
  const wrapped = ((type: keyof typeof REGISTERED_CHAI_BLOCKS): T =>
    has(REGISTERED_CHAI_BLOCKS, type) ? memoized(type) : getter(type)) as MemoizedByRegisteredType<T>;
  wrapped.cache = memoized.cache;
  return wrapped;
};

export const getChaiBlockDefaultProps = memoizeByRegisteredType((type: keyof typeof REGISTERED_CHAI_BLOCKS) => {
  const registeredBlock = get(REGISTERED_CHAI_BLOCKS, type);
  const schema = registeredBlock?.props?.schema ?? {};
  const properties = get(schema, "properties", {});
  const defaultProps: Record<string, any> = {};
  each(properties, (propSchema: ChaiBlockPropsSchema, key) => {
    // Slot props are filled from child blocks at render, never stored on the block.
    if (has(propSchema, "block") || (propSchema as any).slot) {
      return;
    }
    set(defaultProps, key, (propSchema as any).default);
  });
  return defaultProps;
});

export const getBlockI18nProps = memoizeByRegisteredType((type: keyof typeof REGISTERED_CHAI_BLOCKS) => {
  return get(REGISTERED_CHAI_BLOCKS, `${type}.i18nProps`, []);
});

export const getChaiBlockAiProps = memoizeByRegisteredType((type: keyof typeof REGISTERED_CHAI_BLOCKS) => {
  return get(REGISTERED_CHAI_BLOCKS, `${type}.aiProps`, []);
});

const getMemoizedBlockFormSchemas = memoizeByRegisteredType(
  (type: keyof typeof REGISTERED_CHAI_BLOCKS): { schema: RJSFSchema; uiSchema: UiSchema } | undefined => {
    const registeredBlock = getRegisteredChaiBlock(type);
    if (!registeredBlock) {
      return undefined;
    }
    const blockSchema = registeredBlock.props?.schema ?? {};
    const blockUiSchema = registeredBlock.props?.uiSchema ?? {};
    const schema = cloneDeep(blockSchema) as RJSFSchema;
    const properties = get(schema, "properties", {}) as Record<string, any>;
    // Slot props are filled by child blocks, so the settings form never shows them.
    const nonStylesProperties = omitBy(properties, (prop) => prop?.styles === true || prop?.slot === true);
    const uiSchema = cloneDeep(blockUiSchema || {});
    const variantNames = keys(get(registeredBlock, "variants", {}));

    if (isEmpty(variantNames)) {
      set(schema, "properties", nonStylesProperties);
      return { schema, uiSchema };
    }

    // Variant select is derived from the registration, never declared by the
    // block author, so it is injected here rather than in the props schema.
    set(schema, "properties", {
      _variant: {
        type: "string",
        title: "Variant",
        default: "",
        oneOf: [
          { const: "", title: "Default" },
          ...variantNames.map((name) => ({ const: name, title: startCase(name) })),
        ],
      },
      ...nonStylesProperties,
    });
    set(uiSchema, "_variant", { "ui:widget": "variant", "ui:label": false });
    // RJSF errors on properties missing from an explicit ui:order.
    if (isArray(get(uiSchema, "ui:order"))) {
      set(uiSchema, "ui:order", ["_variant", ...(get(uiSchema, "ui:order") as string[])]);
    }
    return { schema, uiSchema };
  },
);

export const getChaiBlockFormSchemas = (
  type: keyof typeof REGISTERED_CHAI_BLOCKS,
): { schema: RJSFSchema; uiSchema: UiSchema } | undefined => {
  const cachedSchemas = getMemoizedBlockFormSchemas(type);
  if (!cachedSchemas) {
    return undefined;
  }
  // Return clones so callers can safely mutate without corrupting the cache.
  return {
    schema: cloneDeep(cachedSchemas.schema),
    uiSchema: cloneDeep(cachedSchemas.uiSchema),
  };
};

const MEMOIZED_BLOCK_GETTERS = new Map<string, MemoizedByRegisteredType<unknown>>(
  Object.entries({
    getBlockDefaultProps: getChaiBlockDefaultProps,
    getBlockI18nProps,
    getBlockAIProps: getChaiBlockAiProps,
    getMemoizedBlockFormSchemas,
  }),
);

// getBlockRuntimeProps lives in the render-helper module
// (builder/core/components/canvas/static/), not here, so that module registers
// its memoized getter through this hook to opt into the same cache invalidation
// on block (re)registration. Keyed by name, so a hot-reloaded module replaces its
// previous getter instead of adding another.
/** @internal */
export const registerMemoizedBlockGetter = (name: string, getter: MemoizedByRegisteredType<unknown>) => {
  MEMOIZED_BLOCK_GETTERS.set(name, getter);
};

const invalidateBlockMemoCaches = (type: keyof typeof REGISTERED_CHAI_BLOCKS) => {
  for (const getter of MEMOIZED_BLOCK_GETTERS.values()) {
    getter.cache.delete(type);
  }
};

export const syncChaiBlocksWithDefaultProps = (blocks: ChaiBlock[]): ChaiBlock[] => {
  return blocks.map((block) => {
    if (has(REGISTERED_CHAI_BLOCKS, block._type)) {
      const defaults = getChaiBlockDefaultProps(block._type);
      return { ...defaults, ...block } as ChaiBlock;
    }
    return block;
  });
};

const registerInternalBlock = (component: React.ComponentType<ChaiBlockComponentProps>, options: ChaiBlockConfig) => {
  const existingBlock = get(REGISTERED_CHAI_BLOCKS, options.type);
  if (existingBlock) {
    set(REGISTERED_CHAI_BLOCKS, options.type, {
      ...existingBlock,
      component,
      ...options,
    });
  } else {
    set(REGISTERED_CHAI_BLOCKS, options.type, { component, ...options });
  }
  invalidateBlockMemoCaches(options.type);
};

export const registerChaiBlock = (
  component: React.ComponentType<ChaiBlockComponentProps<any>>,
  options: ChaiBlockConfig,
) => {
  registerInternalBlock(component, {
    ...options,
    ...{ category: options.category || "core" },
  });
};

export const registerChaiServerBlock = (
  component: React.ComponentType<ChaiBlockComponentProps<any>>,
  options: Pick<ChaiBlockConfig, "type" | "dataProvider" | "i18nProps" | "aiProps">,
) => {
  const existingBlock = get(REGISTERED_CHAI_BLOCKS, options.type);
  if (existingBlock) {
    set(REGISTERED_CHAI_BLOCKS, options.type, {
      ...existingBlock,
      component,
      ...options,
    });
  } else {
    set(REGISTERED_CHAI_BLOCKS, options.type, { component, ...options });
  }
  invalidateBlockMemoCaches(options.type);
};

/** @internal Applies a data provider to the in-memory block registry. */
export const applyBlockDataProviderToRegistry = <K extends Record<string, any> = Record<string, any>>(
  type: keyof typeof REGISTERED_CHAI_BLOCKS | string,
  dataProvider: (args: {
    lang: string;
    draft: boolean;
    inBuilder: boolean;
    block: ChaiBlock<K>;
    pageProps: ChaiPageProps;
  }) => Promise<K>,
) => {
  const registeredBlock = getRegisteredChaiBlock(type);
  set(REGISTERED_CHAI_BLOCKS, type, {
    ...registeredBlock,
    type: registeredBlock?.type ?? type,
    dataProvider,
  });
  invalidateBlockMemoCaches(type);
};

export const registerChaiBlockComponent = (
  type: keyof typeof REGISTERED_CHAI_BLOCKS,
  component: React.ComponentType<ChaiBlockComponentProps<any>>,
) => {
  const registeredBlock = getRegisteredChaiBlock(type);
  set(REGISTERED_CHAI_BLOCKS, type, { ...registeredBlock, component });
  invalidateBlockMemoCaches(type);
};

export const closestBlockProp = (
  blockType: keyof typeof REGISTERED_CHAI_BLOCKS,
  prop: string,
): ChaiBlockPropsSchema => {
  return {
    type: "null",
    block: blockType,
    prop,
    default: null,
    runtime: true,
    ui: { "ui:widget": "hidden" },
  };
};
