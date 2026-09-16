import { cloneDeep, forEach, get, isArray, isEmpty, isString, keys, memoize, startsWith } from "lodash-es";
import { twMerge } from "cnfast";
import { getSplitChaiClasses } from "~/builder/hooks/get-split-classes";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { DESIGN_TOKEN_PREFIX, STYLES_KEY } from "~/constants/STRINGS";
import { getBlockSchema, getRegisteredChaiBlock } from "~/registry";
import { ChaiBlockConfig } from "~/types/blocks";
import { ChaiBlock } from "~/types/common";
import { ChaiDesignTokens } from "~/types/types";
import { toReactDomAttributes } from "~/utils/react-dom-attributes";

export function applyLanguage(_block: ChaiBlock, selectedLang: string, chaiBlock: ChaiBlockConfig) {
  const i18nProps = get(chaiBlock, "i18nProps", []) as string[];
  if (isEmpty(selectedLang) || !isArray(i18nProps) || isEmpty(i18nProps)) return _block;

  let nextBlock: ChaiBlock | null = null;

  i18nProps.forEach((key) => {
    if (!isString(key) || isEmpty(key)) return;
    if (!Object.prototype.hasOwnProperty.call(_block, key)) return;
    const fallbackValue = get(_block, key);
    const value = get(_block, `${key}-${selectedLang}`, "");
    const resolvedValue = isString(fallbackValue)
      ? isString(value) && !isEmpty(value.trim())
        ? value.trimStart() || fallbackValue
        : fallbackValue
      : isEmpty(value)
        ? fallbackValue
        : value;

    if (resolvedValue !== fallbackValue) {
      if (!nextBlock) nextBlock = { ..._block };
      nextBlock[key] = resolvedValue;
    }
  });

  return nextBlock || _block;
}

export const applyBinding = (
  block: ChaiBlock,
  pageExternalData: Record<string, any>,
  { index, key: repeaterKey }: { index: number; key: string },
) => {
  const clonedBlock = cloneDeep(block);
  forEach(keys(clonedBlock), (key) => {
    if (isString(clonedBlock[key]) && !startsWith(key, "_")) {
      let value: any = clonedBlock[key];
      if (key === "repeaterItems") {
        clonedBlock["repeaterItemsBinding"] = value;
      }
      // check for {{string.key}} and replace with pageExternalData
      const bindingRegex = /\{\{(.*?)\}\}/g;
      const matches = value.match(bindingRegex);
      if (matches) {
        matches.forEach((match: string) => {
          let binding = match.slice(2, -2);
          if (index !== -1 && repeaterKey !== "" && startsWith(binding, "$index.")) {
            binding = `${repeaterKey.replace(/\{\{(.*)\}\}/g, "$1")}.${binding.replace("$index", `${index}`)}`;
          }
          const bindingValue = get(pageExternalData, binding, match);
          value = isArray(bindingValue) ? bindingValue : value.replace(match, bindingValue);
        });
      }
      clonedBlock[key] = value;
    }
  });
  return clonedBlock;
};

const resolveTokenValue = (value: string | undefined, designTokens: ChaiDesignTokens, seen: Set<string>): string => {
  if (!value) return "";
  return value
    .split(" ")
    .map((cls) => {
      if (!cls.startsWith(DESIGN_TOKEN_PREFIX)) return cls;
      if (seen.has(cls)) return "";
      // Unknown reference: keep the literal so the broken token stays visible.
      if (!designTokens[cls]) return cls;
      seen.add(cls);
      const resolved = resolveTokenValue(designTokens[cls].value, designTokens, seen);
      // `seen` is a recursion stack, not a visited set — a token referenced
      // twice as siblings must resolve both times.
      seen.delete(cls);
      return resolved;
    })
    .filter(Boolean)
    .join(" ");
};

// WeakMap, not lodash memoize: render paths pass a fresh designTokens object per
// request (and `getBlockTagAttributes` defaults to a fresh `{}` per call), so a
// strong identity-keyed cache never hits and grows unbounded on warm instances.
const mergedDesignTokensCache = new WeakMap<ChaiDesignTokens, ChaiDesignTokens>();
const getMergedDesignTokens = (designTokens: ChaiDesignTokens): ChaiDesignTokens => {
  let merged = mergedDesignTokensCache.get(designTokens);
  if (!merged) {
    merged = { ...CHAI_BUILT_IN_DESIGN_TOKENS, ...designTokens };
    mergedDesignTokensCache.set(designTokens, merged);
  }
  return merged;
};

const classNamesCache = new WeakMap<ChaiDesignTokens, Map<string, string>>();
const blockTagAttributesCache = new WeakMap<
  ChaiBlock,
  WeakMap<ChaiDesignTokens, { inBuilder?: Record<string, any>; inRenderer?: Record<string, any> }>
>();
const MAX_CLASS_NAMES_CACHE_PER_DESIGN_TOKENS = 5000;

const enforceClassNamesCacheLimit = (tokenCache: Map<string, string>) => {
  while (tokenCache.size > MAX_CLASS_NAMES_CACHE_PER_DESIGN_TOKENS) {
    const oldestKey = tokenCache.keys().next().value;
    if (!oldestKey) return;
    tokenCache.delete(oldestKey);
  }
};

const getCachedClassNames = (styles: string, designTokens: ChaiDesignTokens) => {
  let tokenCache = classNamesCache.get(designTokens);
  if (!tokenCache) {
    tokenCache = new Map<string, string>();
    classNamesCache.set(designTokens, tokenCache);
  }

  const cachedClassNames = tokenCache.get(styles);
  if (cachedClassNames !== undefined) {
    return cachedClassNames;
  }

  const classNames = generateClassNames(styles, designTokens);
  tokenCache.set(styles, classNames);
  enforceClassNamesCacheLimit(tokenCache);
  return classNames;
};

export const generateClassNames = (styles: string, designTokens: ChaiDesignTokens) => {
  const finalDesignTokens = getMergedDesignTokens(designTokens);
  const { baseClasses, classes } = getSplitChaiClasses(styles);
  const tokens = classes.split(" ").filter((token) => token.startsWith(DESIGN_TOKEN_PREFIX));
  const tokenValues = tokens.map((token) =>
    resolveTokenValue(finalDesignTokens[token]?.value, finalDesignTokens, new Set([token])),
  );
  const nonTokenClasses = classes
    .split(" ")
    .filter((token) => !token.startsWith(DESIGN_TOKEN_PREFIX))
    .join(" ");
  return twMerge.apply(null, [baseClasses, ...tokenValues, nonTokenClasses]);
};

function getElementAttrs(block: ChaiBlock, key: string) {
  // Authored as HTML (`datetime`, `colspan`), rendered through
  // `React.createElement`, which only accepts the DOM-property spelling.
  return toReactDomAttributes(get(block, `${key}_attrs`, {}) as Record<string, string>);
}

export function getBlockTagAttributes(
  block: ChaiBlock,
  isInBuilder: boolean = true,
  designTokens: ChaiDesignTokens = {},
) {
  let byDesignTokens = blockTagAttributesCache.get(block);
  if (!byDesignTokens) {
    byDesignTokens = new WeakMap();
    blockTagAttributesCache.set(block, byDesignTokens);
  }

  let cachedAttributes = byDesignTokens.get(designTokens);
  if (!cachedAttributes) {
    cachedAttributes = {};
    byDesignTokens.set(designTokens, cachedAttributes);
  }

  const cacheKey = isInBuilder ? "inBuilder" : "inRenderer";
  const cachedStyles = cachedAttributes[cacheKey];
  if (cachedStyles) {
    return cachedStyles;
  }

  const styles: Record<string, any> = {};
  Object.keys(block).forEach((key) => {
    if (isString(block[key]) && block[key].startsWith(STYLES_KEY)) {
      const className = getCachedClassNames(block[key], designTokens);
      const { className: attrClassName, ...attrs } = getElementAttrs(block, key);
      // An authored `class` attribute adds to the block's styles instead of
      // replacing them — dropping the generated classes would unstyle the block.
      const finalClassName = twMerge(className, attrClassName as string);
      styles[key] = {
        ...(!isEmpty(finalClassName) && { className: finalClassName }),
        ...attrs,
        ...(isInBuilder
          ? {
              "data-style-prop": key,
              "data-block-parent": block._id,
              "data-style-id": `${key}-${block._id}`,
            }
          : {}),
      };
    }
  });

  cachedAttributes[cacheKey] = styles;
  return styles;
}

export const getBlockRuntimeProps: (blockType: string) => Record<string, unknown> = memoize((blockType: string) => {
  const chaiBlock = getRegisteredChaiBlock(blockType) as any;
  // Route the block-schema lookup through the shared `getBlockSchema` helper
  // (`~/registry`, here `props?.schema`) so it lives in one place. Guard with
  // `?? {}` because `getBlockSchema` is not null-safe for an unregistered block
  // type.
  const props = get(getBlockSchema(chaiBlock ?? {}), "properties", {});
  // return key value with value has runtime: true
  return Object.fromEntries(Object.entries(props).filter(([, value]) => get(value, "runtime", false)));
});

export const applyLimit = (data: unknown, block: ChaiBlock): typeof data => {
  // Only operate on arrays
  if (!isArray(data)) return data;
  let result = data as any[];

  // Only apply limit
  let limit: number | undefined = undefined;
  if (typeof block.limit === "number" && block.limit > 0) {
    limit = block.limit;
  }
  if (limit !== undefined) {
    result = result.slice(0, limit);
  }

  return result as typeof data;
};

export { applyChaiDataBinding } from "~/utils/apply-chai-data-binding";
